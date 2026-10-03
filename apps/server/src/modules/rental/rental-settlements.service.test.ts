import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  RentalBillDetail,
  RentalBillLine,
  RentalCashEntry,
  RentalSettlementDetail,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { rentalBillingDetail, rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillRevisionsRepository } from "./bill-revisions.repository.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { financeRequestHash } from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { RentalSettlementsService } from "./rental-settlements.service.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

const maximum = Number.MAX_SAFE_INTEGER;
const contractId = "00000000-0000-4000-8000-000000000001";
const monthlyBillId = "00000000-0000-4000-8000-000000000101";
const depositBillId = "00000000-0000-4000-8000-000000000102";
const auth: AuthContext = {
  organizationId: "org",
  userId: "user",
  sessionId: "session",
  isSuperAdmin: false,
  permissions: ["rental_contracts:read", "rental_bills:read", "rental_settlements:confirm"],
};

describe("RentalSettlementsService", () => {
  it("按真实原账单目标检查应收余额溢出，即使整份合同净差额仍安全", async () => {
    const source = overflowSnapshot();
    const { service } = await serviceHarness(source);

    const error = await service
      .preview(auth, { contractId, extraFees: [], finalReadings: terminalReadings(source) })
      .then(
        () => null,
        (reason: unknown) => reason,
      );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: "财务余额超出安全整数范围",
    });
  });

  it("缺少结算确认权限时在事务和来源读取前拒绝", async () => {
    const h = await serviceHarness(rentalFinanceSnapshot());
    const denied = {
      ...auth,
      permissions: auth.permissions.filter((key) => key !== "rental_settlements:confirm"),
    };

    expect(() => h.service.preview(denied, { contractId, extraFees: [] })).toThrow(
      ForbiddenException,
    );

    expect(h.mocks.transactions.run).not.toHaveBeenCalled();
    expect(h.mocks.sources.read).not.toHaveBeenCalled();
  });

  it("跨组织找不到合同且不会读取或写入该合同财务来源", async () => {
    const h = await serviceHarness(rentalFinanceSnapshot());
    h.mocks.contracts.find.mockImplementation(async () => null);

    await expect(
      h.service.preview({ ...auth, organizationId: "another-org" }, { contractId, extraFees: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(h.mocks.sources.read).not.toHaveBeenCalled();
    expect(h.mocks.billRevisions.append).not.toHaveBeenCalled();
    expect(h.mocks.meterReadings.appendBoundary).not.toHaveBeenCalled();
    expect(h.mocks.settlements.create).not.toHaveBeenCalled();
    expect(h.mocks.financeRequests.complete).not.toHaveBeenCalled();
  });

  it("预览只读取来源，不触发任何财务写入或审计", async () => {
    const h = await serviceHarness(rentalFinanceSnapshot());

    const preview = await h.service.preview(auth, { contractId, extraFees: [] });

    expect(preview).toMatchObject({
      canConfirm: false,
      missingFields: ["electricityReading", "waterReading"],
    });
    expect(h.mocks.sources.read).toHaveBeenCalledTimes(1);
    expect(h.mocks.bills.createGeneration).not.toHaveBeenCalled();
    expect(h.mocks.billRevisions.append).not.toHaveBeenCalled();
    expect(h.mocks.meterReadings.appendBoundary).not.toHaveBeenCalled();
    expect(h.mocks.meterReadings.reviseBoundary).not.toHaveBeenCalled();
    expect(h.mocks.settlements.create).not.toHaveBeenCalled();
    expect(h.mocks.settlements.linkBills).not.toHaveBeenCalled();
    expect(h.mocks.financeRequests.complete).not.toHaveBeenCalled();
    expect(h.mocks.audit.appendRequired).not.toHaveBeenCalled();
  });

  it("同一事务先存末次读数、释放未来区间，再转入结束月并重接后继", async () => {
    const source = futureMeterSnapshot();
    const h = await serviceHarness(source);
    const order: string[] = [];
    h.mocks.meterReadings.appendBoundary.mockImplementation(async (_scope, input) => {
      order.push(`reading:${input.kind}`);
      const reading = {
        id: `terminal-${input.kind}`,
        ...input,
        contractId,
        revision: 1,
      };
      source.readings.push(reading);
      return reading;
    });
    h.mocks.billRevisions.append.mockImplementation(async (_scope, id, lines) => {
      order.push(lines.length === 0 ? `withdraw-revision:${id}` : `end-month-revision:${id}`);
      return undefined as never;
    });
    h.mocks.bills.voidBills.mockImplementation(async (_context, ids) => {
      order.push(`void:${ids.join(",")}`);
    });
    h.mocks.bills.createGeneration.mockImplementation(async () => {
      order.push("generation");
      return { id: "generation" } as never;
    });
    h.mocks.bills.insertBills.mockImplementation(async () => {
      order.push("end-month-insert");
      return [{ id: "ending-month-bill" }] as never;
    });
    h.mocks.meterReadings.reviseBoundary.mockImplementation(async (_scope, id, input) => {
      order.push(`rewire:${id}`);
      return { id, ...input } as never;
    });
    h.mocks.settlements.create.mockImplementation(async () => {
      order.push("settlement");
      return { id: "settlement" } as never;
    });
    h.mocks.settlements.linkBills.mockImplementation(async () => {
      order.push("link");
    });
    h.mocks.projection.refresh.mockImplementation(async () => {
      order.push("projection");
      return settlementDetail("settlement");
    });
    h.mocks.financeRequests.complete.mockImplementation(async () => {
      order.push("idempotency");
    });
    h.mocks.audit.appendRequired.mockImplementation(async () => {
      order.push("audit");
    });

    const finalReadings = [
      { kind: "water" as const, readingDate: "2026-08-31", reading: "105" },
      { kind: "electricity" as const, readingDate: "2026-08-31", reading: "55" },
    ];
    const preview = await h.service.preview(auth, {
      contractId,
      extraFees: [],
      finalReadings,
    });
    expect(preview.canConfirm).toBe(true);
    await h.service.confirm(auth, {
      contractId,
      extraFees: [],
      finalReadings,
      expectedVersion: preview.version,
      idempotencyKey: "withdraw-order",
    });

    expect(order).toEqual([
      "reading:water",
      "reading:electricity",
      "withdraw-revision:future-bill",
      "void:future-bill",
      "generation",
      "end-month-insert",
      "rewire:water-end",
      "rewire:electricity-end",
      "settlement",
      "link",
      "projection",
      "idempotency",
      "audit",
    ]);
  });

  it("同幂等键已用于其他财务内容时冲突，且不会检查或写来源", async () => {
    const h = await serviceHarness(rentalFinanceSnapshot());
    const input = {
      contractId,
      extraFees: [],
      expectedVersion: "stale",
      idempotencyKey: "same-key",
    };
    h.mocks.financeRequests.find.mockImplementation(async () => ({
      organizationId: auth.organizationId,
      contractId,
      action: "monthly_bill.generate",
      requestHash: financeRequestHash("monthly_bill.generate", input),
    }));

    await expect(h.service.confirm(auth, input)).rejects.toBeInstanceOf(ConflictException);

    expect(h.mocks.contracts.find).not.toHaveBeenCalled();
    expect(h.mocks.sources.read).not.toHaveBeenCalled();
    expect(h.mocks.bills.findGeneration).not.toHaveBeenCalled();
    expect(h.mocks.settlements.create).not.toHaveBeenCalled();
    expect(h.mocks.financeRequests.complete).not.toHaveBeenCalled();
  });

  it("完成请求重放在版本检查前返回当前已保存结算", async () => {
    const settlement = settlementDetail("saved-settlement");
    const source = rentalFinanceSnapshot({ settlement });
    const h = await serviceHarness(source);
    const input = {
      contractId,
      extraFees: [],
      expectedVersion: "obsolete-version",
      idempotencyKey: "completed-key",
    };
    h.mocks.financeRequests.find.mockImplementation(async () => ({
      organizationId: auth.organizationId,
      contractId,
      idempotencyKey: input.idempotencyKey,
      action: "rental_settlement.confirm",
      requestHash: financeRequestHash("rental_settlement.confirm", input),
      result: { resourceId: settlement.id, resourceKind: "settlement" },
    }));
    h.mocks.settlements.findCurrent.mockImplementation(async () => ({ id: settlement.id }));

    const replay = await h.service.confirm(auth, input);

    expect(replay).toEqual(settlement);
    expect(h.mocks.sources.read).toHaveBeenCalledTimes(1);
    expect(h.mocks.bills.findGeneration).not.toHaveBeenCalled();
    expect(h.mocks.settlements.create).not.toHaveBeenCalled();
    expect(h.mocks.financeRequests.complete).not.toHaveBeenCalled();
    expect(h.mocks.audit.appendRequired).not.toHaveBeenCalled();
  });
});

async function serviceHarness(source: RentalFinanceSnapshot) {
  const mocks = {
    sources: { read: vi.fn(async () => source) },
    settlements: {
      findCurrent: vi.fn(async () => null as unknown),
      create: vi.fn(),
      linkBills: vi.fn(),
    },
    billRevisions: { append: vi.fn() },
    meterReadings: { appendBoundary: vi.fn(), reviseBoundary: vi.fn() },
    bills: {
      findGeneration: vi.fn(async () => null),
      createGeneration: vi.fn(),
      insertBills: vi.fn(),
      voidBills: vi.fn(),
    },
    financeRequests: {
      find: vi.fn(async () => null as unknown),
      complete: vi.fn(),
    },
    contracts: {
      find: vi.fn(async () => ({ propertyId: source.contract.propertyId }) as unknown),
      findForUpdate: vi.fn(async () => ({ propertyId: source.contract.propertyId }) as unknown),
    },
    policy: {
      lockOrganizationContext: vi.fn(async () => ({
        timezone: "UTC",
        today: source.context.today,
      })),
      requireOwnedPropertyForUpdate: vi.fn(async () => ({})),
      requireContract: vi.fn((value: unknown) => {
        if (!value) throw new NotFoundException();
        return value;
      }),
    },
    projection: { refresh: vi.fn() },
    access: {
      assertPermission: vi.fn(
        (context: AuthContext, permission: AuthContext["permissions"][number]) => {
          if (!context.permissions.includes(permission)) throw new ForbiddenException();
        },
      ),
    },
    audit: { appendRequired: vi.fn() },
    transactions: {
      run: vi.fn(async (callback: (tx: never) => unknown) => callback({} as never)),
    },
    projectionSources: { readMany: vi.fn(async () => [null]) },
  };
  const module = await Test.createTestingModule({
    providers: [
      RentalSettlementsService,
      { provide: RentalFinanceSourceService, useValue: mocks.sources },
      { provide: RentalSettlementsRepository, useValue: mocks.settlements },
      { provide: BillRevisionsRepository, useValue: mocks.billRevisions },
      { provide: MeterReadingsRepository, useValue: mocks.meterReadings },
      { provide: BillsRepository, useValue: mocks.bills },
      { provide: FinanceRequestsRepository, useValue: mocks.financeRequests },
      { provide: ContractsRepository, useValue: mocks.contracts },
      { provide: ContractsPolicyService, useValue: mocks.policy },
      { provide: SettlementProjectionService, useValue: mocks.projection },
      { provide: AccessService, useValue: mocks.access },
      { provide: AuditService, useValue: mocks.audit },
      { provide: DatabaseTransactionService, useValue: mocks.transactions },
      { provide: RentalCashProjectionRepository, useValue: mocks.projectionSources },
    ],
  }).compile();
  return { service: module.get(RentalSettlementsService), mocks, module };
}

function settlementDetail(id: string): RentalSettlementDetail {
  const version = "settlement-version";
  return {
    id,
    contractId,
    eventId: "settlement-event",
    kind: "expiry",
    effectiveEndDate: "2026-12-31",
    version,
    revision: 1,
    finalCostMinor: 100,
    balance: {
      receivedMinor: 0,
      refundedMinor: 0,
      netReceivedMinor: 0,
      outstandingMinor: 100,
      refundableMinor: 0,
      state: "unpaid",
      overdue: false,
      version,
    },
    status: "pending_collection",
    confirmedAt: "2026-12-31T00:00:00.000Z",
    confirmedByUserId: "user",
  };
}

function overflowSnapshot(): RentalFinanceSnapshot {
  const billingSource = rentalBillingSource({
    id: contractId,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    rentAmountMinor: maximum,
    paymentIntervalMonths: 1,
  });
  const lines: RentalBillLine[] = [
    {
      kind: "rent_period",
      label: "月租",
      amountMinor: maximum,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      referenceStart: "2026-08-01",
      referenceEnd: "2026-08-31",
      coveredDays: 31,
      referenceDays: 31,
      baseRentAmountMinor: maximum,
      sortOrder: 0,
    },
  ];
  const draft = {
    type: "monthly" as const,
    sourceKey: "monthly:2026-08",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    effectiveEnd: "2026-08-31",
    dueDate: "2026-08-31",
    amountMinor: maximum,
    lines,
    depositSourceId: null,
    depositSnapshot: null,
  };
  const monthly = {
    ...rentalBillingDetail(billingSource, draft),
    id: monthlyBillId,
    modelVersion: 2 as const,
    billingMonth: "2026-08",
    revision: 1,
  } satisfies RentalBillDetail;
  const monthlyLine = lines[0];
  if (!monthlyLine) throw new Error("Expected the monthly rent line");
  const deposit = {
    ...monthly,
    id: depositBillId,
    type: "deposit" as const,
    sourceKey: "deposit:original",
    billingMonth: null,
    amountMinor: 1,
    lines: [{ ...monthlyLine, kind: "deposit", label: "押金", amountMinor: 1 }],
  } satisfies RentalBillDetail;
  const base = rentalFinanceSnapshot();
  const waterBaseline = base.readings.find(({ kind }) => kind === "water");
  const powerBaseline = base.readings.find(({ kind }) => kind === "electricity");
  if (!waterBaseline || !powerBaseline) throw new Error("Expected meter baselines");
  const waterEnd = {
    ...waterBaseline,
    id: "00000000-0000-4000-8000-000000000103",
    readingDate: "2026-08-31",
    predecessorId: waterBaseline.id,
  };
  const electricityEnd = {
    ...powerBaseline,
    id: "00000000-0000-4000-8000-000000000104",
    readingDate: "2026-08-31",
    predecessorId: powerBaseline.id,
  };
  const cashEntries: RentalCashEntry[] = [
    {
      id: randomUUID(),
      contractId,
      target: { kind: "bill", billId: monthlyBillId },
      kind: "refund",
      purpose: "refund",
      amountMinor: 1,
      occurredOn: "2026-08-31",
      note: null,
      createdAt: "2026-08-31T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    },
    {
      id: randomUUID(),
      contractId,
      target: { kind: "bill", billId: depositBillId },
      kind: "receipt",
      purpose: "deposit_receipt",
      amountMinor: 1,
      occurredOn: "2026-08-31",
      note: null,
      createdAt: "2026-08-31T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    },
  ];
  return {
    ...base,
    contract: {
      ...base.contract,
      id: contractId,
      billingMode: "monthly_settlement" as const,
      lifecycleStatus: "confirmed" as const,
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      rentAmountMinor: maximum,
      billingAnchor: "calendar_month" as const,
      paymentIntervalMonths: 1 as const,
      dueDaysBefore: 0,
    },
    terms: {
      contractId,
      version: "1",
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
      waterUnitPrice: "0.0000",
      electricityUnitPrice: "0.0000",
      fixedFees: [],
    },
    readings: [...base.readings, waterEnd, electricityEnd],
    bills: [monthly, deposit],
    cashEntries,
  };
}

function futureMeterSnapshot(): RentalFinanceSnapshot {
  const source = rentalFinanceSnapshot();
  source.context.today = "2026-09-30";
  source.contract = {
    ...source.contract,
    lifecycleStatus: "terminated",
    startDate: "2026-08-01",
    endDate: "2026-12-31",
    actualEndDate: "2026-08-31",
    terminationDate: "2026-08-31",
    rentAmountMinor: 100_000,
    billingAnchor: "calendar_month",
    paymentIntervalMonths: 1,
  } as never;
  source.terms = {
    contractId,
    version: "1",
    waterCollectionEnabled: true,
    electricityCollectionEnabled: true,
    waterUnitPrice: "4.0000",
    electricityUnitPrice: "5.0000",
    fixedFees: [],
  };
  const lines: RentalBillLine[] = [];
  for (const [index, kind] of (["water", "electricity"] as const).entries()) {
    const start = source.readings.find(({ kind: readingKind }) => readingKind === kind);
    if (!start) throw new Error(`Expected the ${kind} baseline`);
    start.readingDate = "2026-08-01";
    const end = {
      ...start,
      id: `${kind}-end`,
      readingDate: "2026-09-30",
      reading: kind === "water" ? "110" : "60",
      predecessorId: start.id,
    };
    source.readings.push(end);
    lines.push({
      kind,
      label: kind === "water" ? "水费" : "电费",
      amountMinor: 3_000,
      periodStart: start.readingDate,
      periodEnd: end.readingDate,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: index,
      feeSnapshot: {
        kind,
        startReadingId: start.id,
        endReadingId: end.id,
        startDate: start.readingDate,
        endDate: end.readingDate,
        startReading: start.reading,
        endReading: end.reading,
        unitPrice: kind === "water" ? "3.0000" : "4.0000",
        overrideReason: "future-price",
      },
    });
  }
  const rent: RentalBillLine = {
    kind: "rent_period",
    label: "月租",
    amountMinor: 100_000,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    referenceStart: "2026-09-01",
    referenceEnd: "2026-09-30",
    coveredDays: 30,
    referenceDays: 30,
    baseRentAmountMinor: 100_000,
    sortOrder: 2,
  };
  lines.push(rent);
  const billingSource = rentalBillingSource({
    id: contractId,
    startDate: "2026-08-01",
    endDate: "2026-12-31",
    rentAmountMinor: 100_000,
  });
  const future = {
    ...rentalBillingDetail(billingSource, {
      type: "monthly",
      sourceKey: "monthly:2026-09",
      periodStart: "2026-08-01",
      periodEnd: "2026-09-30",
      effectiveEnd: "2026-09-30",
      dueDate: "2026-09-30",
      amountMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0),
      lines,
      depositSourceId: null,
      depositSnapshot: null,
    }),
    id: "future-bill",
    modelVersion: 2,
    billingMonth: "2026-09",
    revision: 1,
  } satisfies RentalBillDetail;
  source.bills = [future];
  return source;
}

function terminalReadings(source: RentalFinanceSnapshot) {
  return source.readings
    .filter(({ readingDate }) => readingDate === "2026-08-31")
    .map(({ kind, readingDate, reading }) => ({ kind, readingDate, reading }));
}
