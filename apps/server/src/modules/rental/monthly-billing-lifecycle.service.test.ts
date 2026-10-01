import { Test } from "@nestjs/testing";
import type {
  RentalBillDetail,
  RentalBillLine,
  RentalCashEntry,
  RentalContractDepositTerm,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import {
  financeContractId,
  rentalFinanceAuth,
  rentalFinanceSnapshot,
} from "../../test/rental-finance-fixtures.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessRepository } from "../iam/access.repository.js";
import { AccessService } from "../iam/access.service.js";
import { BillRevisionsRepository } from "./bill-revisions.repository.js";
import { buildDepositDrafts } from "./billing-source.rules.js";
import { BillsRepository } from "./bills.repository.js";
import { MonthlyBillingLifecycleService } from "./monthly-billing-lifecycle.service.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

const lifecycleAuth: AuthContext = {
  ...rentalFinanceAuth,
  permissions: [
    ...rentalFinanceAuth.permissions,
    "rental_bills:adjust",
    "rental_settlements:confirm",
  ],
};
const tx = { transaction: "supplied" } as never;

function line(
  kind: RentalBillLine["kind"],
  label: string,
  amountMinor: number,
  overrides: Partial<RentalBillLine> = {},
): RentalBillLine {
  return {
    kind,
    label,
    amountMinor,
    periodStart: null,
    periodEnd: null,
    referenceStart: null,
    referenceEnd: null,
    coveredDays: null,
    referenceDays: null,
    baseRentAmountMinor: null,
    sortOrder: 0,
    ...overrides,
  };
}

function bill(options: {
  id: string;
  type: RentalBillDetail["type"];
  sourceKey: string;
  lines: RentalBillLine[];
  billingMonth?: string | null;
  status?: RentalBillDetail["status"];
}): RentalBillDetail {
  const { id, type, sourceKey, lines, billingMonth = null, status = "active" } = options;
  return {
    id,
    billNumber: id,
    contractId: financeContractId,
    contractNumber: "RC-2026-000001",
    propertyId: "00000000-0000-4000-8000-000000000002",
    propertyName: "测试房产",
    currencyCode: "CNY",
    type,
    status,
    sourceKey,
    periodStart: null,
    periodEnd: null,
    effectiveEnd: null,
    dueDate: "2026-08-31",
    amountMinor: lines.reduce((total, item) => total + item.amountMinor, 0),
    dueState: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    modelVersion: 2,
    billingMonth,
    revision: 1,
    lines,
    generationId: null,
    adjustmentId: null,
    adjustment: null,
    snapshot: {
      propertyId: "00000000-0000-4000-8000-000000000002",
      propertyName: "测试房产",
      contractNumber: "RC-2026-000001",
      spaces: [],
      parties: [],
    },
    voidReason: status === "voided" ? "历史来源已撤销" : null,
    voidedAt: status === "voided" ? "2026-08-01T00:00:00.000Z" : null,
    voidedBy: status === "voided" ? "user" : null,
    history: [],
  };
}

function cashEntry(
  id: string,
  kind: RentalCashEntry["kind"],
  amountMinor: number,
  billId: string,
  revokedAt: string | null = null,
): RentalCashEntry {
  return {
    id,
    contractId: financeContractId,
    target: { kind: "bill", billId },
    kind,
    purpose: kind === "receipt" ? "deposit_receipt" : "refund",
    amountMinor,
    occurredOn: "2026-08-20",
    note: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    createdByUserId: lifecycleAuth.userId,
    revokedAt,
    revokedByUserId: revokedAt ? lifecycleAuth.userId : null,
    revokeReason: revokedAt ? "重复登记" : null,
  };
}

function withSnapshot(overrides: Partial<RentalFinanceSnapshot> = {}): RentalFinanceSnapshot {
  const base = rentalFinanceSnapshot();
  return {
    ...base,
    ...overrides,
    contract: { ...base.contract, ...overrides.contract },
  };
}

function correctionCase() {
  const oldDepositTerm: RentalContractDepositTerm = {
    id: "00000000-0000-4000-8000-000000000051",
    type: "rental",
    customName: null,
    calculationMode: "fixed_amount",
    fixedAmountMinor: 300_000,
    rentMultiple: null,
    finalAmountMinor: 300_000,
    sortOrder: 0,
  };
  const newDepositTerm: RentalContractDepositTerm = {
    ...oldDepositTerm,
    id: "00000000-0000-4000-8000-000000000052",
    type: "utility",
    fixedAmountMinor: 200_000,
    finalAmountMinor: 200_000,
  };
  const before = rentalBillingSource({
    billingMode: "monthly_settlement",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    actualEndDate: "2026-01-31",
    rentAmountMinor: 300_000,
    billingAnchor: "calendar_month",
    paymentIntervalMonths: 1,
    depositTerms: [oldDepositTerm],
  });
  const after = {
    ...before,
    contract: {
      ...before.contract,
      rentAmountMinor: 400_000,
      depositTerms: [newDepositTerm],
    },
  };
  const rentLine = line("rent_period", "月租", 300_000, {
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    referenceStart: "2026-01-01",
    referenceEnd: "2026-01-31",
    coveredDays: 31,
    referenceDays: 31,
    baseRentAmountMinor: 300_000,
  });
  const historicFee = line("fixed_fee", "历史物业费", 5_000, {
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    referenceStart: "2026-01-01",
    referenceEnd: "2026-01-31",
    coveredDays: 31,
    referenceDays: 31,
    feeSnapshot: {
      kind: "fixed_fee",
      feeId: "historic-fee",
      monthlyAmountMinor: 5_000,
      overrideReason: "历史约定",
    },
  });
  const monthlyBill = bill({
    id: "bill-monthly-stable",
    type: "monthly",
    sourceKey: "monthly:2026-01",
    billingMonth: "2026-01",
    lines: [rentLine, historicFee],
  });
  const oldDepositKey = buildDepositDrafts([oldDepositTerm], {})[0]?.sourceKey;
  const newDepositKey = buildDepositDrafts([newDepositTerm], {})[0]?.sourceKey;
  if (!oldDepositKey || !newDepositKey) throw new Error("押金来源 fixture 无效");
  const oldDeposit = bill({
    id: "bill-deposit-old",
    type: "deposit",
    sourceKey: oldDepositKey,
    lines: [line("deposit", "原租赁押金", 300_000)],
  });
  const newDeposit = bill({
    id: "bill-deposit-new",
    type: "deposit",
    sourceKey: newDepositKey,
    lines: [line("deposit", "新水电押金", 200_000)],
  });
  before.activeBills = [monthlyBill, oldDeposit];
  const snapshot = withSnapshot({
    contract: { ...after.contract },
    bills: [monthlyBill, oldDeposit, newDeposit],
    cashEntries: [cashEntry("deposit-receipt-old", "receipt", 300_000, oldDeposit.id)],
    settlement: {} as never,
  });
  return { before, after, snapshot, monthlyBill, oldDeposit, newDeposit, historicFee };
}

function cancellationCase(
  options: { bills?: RentalBillDetail[]; cashEntries?: RentalCashEntry[] } = {},
) {
  const before = rentalBillingSource({ billingMode: "monthly_settlement" });
  const cancelledOn = "2026-08-20";
  const after = { ...before, cancelledOn };
  const snapshot = withSnapshot({
    bills: options.bills ?? [],
    cashEntries: options.cashEntries ?? [],
  });
  return { before, after, snapshot, cancelledOn };
}

async function createHarness(snapshot: RentalFinanceSnapshot) {
  const sources = { read: vi.fn().mockResolvedValue(snapshot) };
  const billRevisions = {
    append: vi
      .fn()
      .mockImplementation(
        async (_scope: unknown, billId: string, _lines: RentalBillLine[], amountMinor: number) => ({
          bill: { id: billId, amountMinor },
        }),
      ),
  };
  const bills = { voidBills: vi.fn().mockResolvedValue(undefined) };
  const settlements = {
    findCurrent: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "settlement-created" }),
    linkBills: vi.fn().mockResolvedValue(undefined),
  };
  const projection = { refresh: vi.fn().mockResolvedValue({ id: "settlement-projected" }) };
  const audit = { appendRequired: vi.fn().mockResolvedValue(undefined) };
  const module = await Test.createTestingModule({
    providers: [
      MonthlyBillingLifecycleService,
      AccessService,
      { provide: AccessRepository, useValue: {} },
      { provide: RentalFinanceSourceService, useValue: sources },
      { provide: BillRevisionsRepository, useValue: billRevisions },
      { provide: BillsRepository, useValue: bills },
      { provide: RentalSettlementsRepository, useValue: settlements },
      { provide: SettlementProjectionService, useValue: projection },
      { provide: AuditService, useValue: audit },
    ],
  }).compile();
  const access = module.get(AccessService);
  const permissionCheck = vi.spyOn(access, "assertPermission");
  return {
    module,
    service: module.get(MonthlyBillingLifecycleService),
    sources,
    billRevisions,
    bills,
    settlements,
    projection,
    audit,
    permissionCheck,
  };
}

type LifecycleHarness = Awaited<ReturnType<typeof createHarness>>;

async function withHarness(
  snapshot: RentalFinanceSnapshot,
  test: (harness: LifecycleHarness) => Promise<void>,
) {
  const harness = await createHarness(snapshot);
  try {
    await test(harness);
  } finally {
    await harness.module.close();
  }
}

describe("MonthlyBillingLifecycleService", () => {
  it("修正沿用月账稳定 ID 与已保存非租金快照，并将旧押金来源独立作废", async () => {
    const scenario = correctionCase();
    const scope = { organizationId: scenario.before.organizationId, contractId: financeContractId };

    await withHarness(scenario.snapshot, async (harness) => {
      await harness.service.onCorrection(lifecycleAuth, scenario.before, scenario.after, tx);

      expect(harness.sources.read).toHaveBeenCalledWith(scope, tx);
      expect(harness.billRevisions.append).toHaveBeenCalledTimes(1);
      expect(harness.billRevisions.append).toHaveBeenCalledWith(
        scope,
        scenario.monthlyBill.id,
        expect.any(Array),
        405_000,
        "合同修正后同步已出账租金",
        { userId: lifecycleAuth.userId },
        tx,
      );
      const revisedLines = harness.billRevisions.append.mock.calls[0]?.[2];
      expect(revisedLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "rent_period", amountMinor: 400_000 }),
          expect.objectContaining({
            kind: "fixed_fee",
            feeSnapshot: scenario.historicFee.feeSnapshot,
            amountMinor: 5_000,
          }),
        ]),
      );
      expect(harness.bills.voidBills).toHaveBeenCalledWith(
        {
          organizationId: scope.organizationId,
          userId: lifecycleAuth.userId,
          today: scenario.before.today,
        },
        [scenario.oldDeposit.id],
        "合同修正，原押金来源已变化",
        tx,
      );
      expect(scenario.oldDeposit.sourceKey).not.toBe(scenario.newDeposit.sourceKey);
      expect(harness.billRevisions.append.mock.calls[0]?.[1]).not.toBe(scenario.oldDeposit.id);
      expect(harness.bills.voidBills.mock.calls[0]?.[1]).not.toContain(scenario.newDeposit.id);
      expect(scenario.snapshot.cashEntries).toEqual([
        cashEntry("deposit-receipt-old", "receipt", 300_000, scenario.oldDeposit.id),
      ]);
      expect(harness.projection.refresh).toHaveBeenCalledWith(scope, lifecycleAuth.userId, tx);
      expect(harness.audit.appendRequired).toHaveBeenCalledTimes(2);
      expect(harness.audit.appendRequired.mock.calls.every((call) => call[1] === tx)).toBe(true);
    });
  });

  it("合同起租日更正按原固定月费快照重算覆盖天数并保留覆写理由", async () => {
    const scenario = correctionCase();
    const originalRent = scenario.monthlyBill.lines.find(({ kind }) => kind === "rent_period");
    const originalFee = scenario.monthlyBill.lines.find(({ kind }) => kind === "fixed_fee");
    if (!originalRent || !originalFee)
      throw new Error("Expected the historical rent and fixed-fee lines");
    scenario.before.contract = {
      ...scenario.before.contract,
      startDate: "2026-12-01",
      endDate: "2027-11-30",
    };
    scenario.after.contract = {
      ...scenario.after.contract,
      startDate: "2026-12-16",
      endDate: "2027-11-30",
    };
    scenario.monthlyBill.billingMonth = "2026-12";
    scenario.monthlyBill.sourceKey = "monthly:2026-12";
    scenario.monthlyBill.lines = [
      {
        ...originalRent,
        periodStart: "2026-12-01",
        periodEnd: "2026-12-31",
        referenceStart: "2026-12-01",
        referenceEnd: "2026-12-31",
        coveredDays: 31,
        referenceDays: 31,
      },
      {
        ...originalFee,
        periodStart: "2026-12-01",
        periodEnd: "2026-12-31",
        referenceStart: "2026-12-01",
        referenceEnd: "2026-12-31",
        coveredDays: 31,
        referenceDays: 31,
      },
    ];
    scenario.monthlyBill.amountMinor = 305_000;
    scenario.snapshot.contract = {
      ...scenario.snapshot.contract,
      startDate: "2026-12-16",
      endDate: "2027-11-30",
    };

    await withHarness(scenario.snapshot, async (harness) => {
      await harness.service.onCorrection(lifecycleAuth, scenario.before, scenario.after, tx);

      const revisedLines = harness.billRevisions.append.mock.calls[0]?.[2] as
        | RentalBillLine[]
        | undefined;
      expect(revisedLines?.find(({ kind }) => kind === "fixed_fee")).toMatchObject({
        amountMinor: 2_581,
        periodStart: "2026-12-16",
        periodEnd: "2026-12-31",
        referenceStart: "2026-12-01",
        referenceEnd: "2026-12-31",
        coveredDays: 16,
        referenceDays: 31,
        feeSnapshot: {
          kind: "fixed_fee",
          monthlyAmountMinor: 5_000,
          overrideReason: "历史约定",
        },
      });
      expect(harness.billRevisions.append).toHaveBeenCalledWith(
        { organizationId: scenario.before.organizationId, contractId: financeContractId },
        scenario.monthlyBill.id,
        expect.any(Array),
        expect.any(Number),
        "合同修正后同步已出账租金",
        { userId: lifecycleAuth.userId },
        tx,
      );
    });
  });

  it("日期更正移除租金和固定费后拒绝负账单并在写入前返回校验错误", async () => {
    const scenario = correctionCase();
    scenario.before.contract = {
      ...scenario.before.contract,
      startDate: "2026-12-01",
      endDate: "2027-11-30",
    };
    scenario.after.contract = {
      ...scenario.after.contract,
      startDate: "2027-01-01",
      endDate: "2027-11-30",
    };
    scenario.monthlyBill.billingMonth = "2026-12";
    scenario.monthlyBill.sourceKey = "monthly:2026-12";
    scenario.monthlyBill.lines = [
      line("rent_period", "月租", 50_000, {
        periodStart: "2026-12-01",
        periodEnd: "2026-12-31",
        referenceStart: "2026-12-01",
        referenceEnd: "2026-12-31",
        coveredDays: 31,
        referenceDays: 31,
        baseRentAmountMinor: 50_000,
      }),
      line("fixed_fee", "网络费", 5_000, {
        periodStart: "2026-12-01",
        periodEnd: "2026-12-31",
        referenceStart: "2026-12-01",
        referenceEnd: "2026-12-31",
        coveredDays: 31,
        referenceDays: 31,
        feeSnapshot: {
          kind: "fixed_fee",
          feeId: "network-fee",
          monthlyAmountMinor: 5_000,
          overrideReason: "本期固定费",
        },
      }),
      line("extra_fee", "本期优惠", -1_000, {
        feeSnapshot: { kind: "extra_fee", extraFeeId: "monthly-discount", origin: "monthly" },
      }),
    ];
    scenario.monthlyBill.amountMinor = 54_000;
    scenario.snapshot.contract = {
      ...scenario.snapshot.contract,
      startDate: "2027-01-01",
      endDate: "2027-11-30",
    };

    await withHarness(scenario.snapshot, async (harness) => {
      await expect(
        harness.service.onCorrection(lifecycleAuth, scenario.before, scenario.after, tx),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          code: "VALIDATION_FAILED",
          message: "修正后的账单金额不能为负数",
        },
      });
      expect(harness.billRevisions.append).not.toHaveBeenCalled();
      expect(harness.bills.voidBills).not.toHaveBeenCalled();
      expect(harness.audit.appendRequired).not.toHaveBeenCalled();
      expect(harness.projection.refresh).not.toHaveBeenCalled();
    });
  });

  it("修正月账或押金来源变化前要求账单读取和调整权限", async () => {
    for (const missingPermission of ["rental_bills:read", "rental_bills:adjust"] as const) {
      const scenario = correctionCase();
      const auth: AuthContext = {
        ...lifecycleAuth,
        permissions: lifecycleAuth.permissions.filter(
          (permission) => permission !== missingPermission,
        ),
      };

      await withHarness(scenario.snapshot, async (harness) => {
        await expect(
          harness.service.onCorrection(auth, scenario.before, scenario.after, tx),
        ).rejects.toMatchObject({ status: 403 });
        expect(harness.permissionCheck.mock.calls.map(([, permission]) => permission)).toEqual(
          missingPermission === "rental_bills:read"
            ? ["rental_bills:read"]
            : ["rental_bills:read", "rental_bills:adjust"],
        );
        expect(harness.billRevisions.append).not.toHaveBeenCalled();
        expect(harness.bills.voidBills).not.toHaveBeenCalled();
        expect(harness.audit.appendRequired).not.toHaveBeenCalled();
        expect(harness.projection.refresh).not.toHaveBeenCalled();
      });
    }
  });

  it.each([
    "audit",
    "projection",
  ] as const)("合同修正时透传必要的 %s 失败", async (failedOperation) => {
    const scenario = correctionCase();
    const failure = new Error(`${failedOperation} failed`);

    await withHarness(scenario.snapshot, async (harness) => {
      if (failedOperation === "audit") {
        harness.audit.appendRequired.mockRejectedValueOnce(failure);
      } else {
        harness.projection.refresh.mockRejectedValueOnce(failure);
      }

      await expect(
        harness.service.onCorrection(lifecycleAuth, scenario.before, scenario.after, tx),
      ).rejects.toBe(failure);
      if (failedOperation === "audit") {
        expect(harness.audit.appendRequired).toHaveBeenCalledWith(
          expect.objectContaining({ action: "rental_bill.revised" }),
          tx,
        );
        expect(harness.projection.refresh).not.toHaveBeenCalled();
      } else {
        expect(harness.audit.appendRequired).toHaveBeenCalledTimes(2);
        expect(harness.projection.refresh).toHaveBeenCalledWith(
          { organizationId: scenario.before.organizationId, contractId: financeContractId },
          lifecycleAuth.userId,
          tx,
        );
      }
    });
  });

  it("没有有效收款时不创建取消结算", async () => {
    const oldBill = bill({
      id: "bill-voided-before-cancel",
      type: "deposit",
      sourceKey: "deposit:historical",
      lines: [line("deposit", "历史押金", 300_000)],
      status: "voided",
    });
    const scenario = cancellationCase({
      bills: [oldBill],
      cashEntries: [
        cashEntry(
          "revoked-deposit-receipt",
          "receipt",
          300_000,
          oldBill.id,
          "2026-08-21T00:00:00.000Z",
        ),
      ],
    });
    const scope = { organizationId: scenario.before.organizationId, contractId: financeContractId };

    await withHarness(scenario.snapshot, async (harness) => {
      await harness.service.onCancel(lifecycleAuth, scenario.before, scenario.after, tx);

      expect(harness.sources.read).toHaveBeenCalledWith(scope, tx);
      expect(harness.permissionCheck).not.toHaveBeenCalled();
      expect(harness.settlements.findCurrent).not.toHaveBeenCalled();
      expect(harness.settlements.create).not.toHaveBeenCalled();
      expect(harness.settlements.linkBills).not.toHaveBeenCalled();
      expect(harness.projection.refresh).not.toHaveBeenCalled();
      expect(harness.audit.appendRequired).not.toHaveBeenCalled();
      expect(harness.bills.voidBills).not.toHaveBeenCalled();
    });
  });

  it("取消结算使用传入取消日和原事务，并从总收款扣除既有退款", async () => {
    const activeBill = bill({
      id: "bill-active-cancel",
      type: "monthly",
      sourceKey: "monthly:2026-08",
      billingMonth: "2026-08",
      lines: [line("rent_period", "月租", 300_000)],
    });
    const oldVoidedBill = bill({
      id: "bill-voided-cash-source",
      type: "deposit",
      sourceKey: "deposit:historical",
      lines: [line("deposit", "历史押金", 300_000)],
      status: "voided",
    });
    const scenario = cancellationCase({
      bills: [activeBill, oldVoidedBill],
      cashEntries: [
        cashEntry("deposit-receipt", "receipt", 500_000, oldVoidedBill.id),
        cashEntry("prior-refund", "refund", 300_000, oldVoidedBill.id),
      ],
    });
    const scope = { organizationId: scenario.before.organizationId, contractId: financeContractId };

    await withHarness(scenario.snapshot, async (harness) => {
      await harness.service.onCancel(lifecycleAuth, scenario.before, scenario.after, tx);

      expect(harness.permissionCheck.mock.calls.map(([, permission]) => permission)).toEqual([
        "rental_bills:read",
        "rental_bills:adjust",
        "rental_contracts:read",
        "rental_bills:read",
        "rental_settlements:confirm",
      ]);
      expect(harness.settlements.findCurrent).toHaveBeenCalledWith(scope, tx);
      expect(harness.bills.voidBills).toHaveBeenCalledWith(
        {
          organizationId: scope.organizationId,
          userId: lifecycleAuth.userId,
          today: scenario.before.today,
        },
        [activeBill.id],
        "合同取消",
        tx,
      );
      expect(harness.settlements.create).toHaveBeenCalledWith(
        scope,
        expect.objectContaining({
          effectiveEndDate: scenario.cancelledOn,
          finalCostMinor: 0,
          differenceMinor: -200_000,
        }),
        expect.objectContaining({ kind: "cancellation", status: "pending_refund" }),
        { userId: lifecycleAuth.userId },
        tx,
      );
      expect(harness.settlements.linkBills).toHaveBeenCalledWith(
        scope,
        "settlement-created",
        [activeBill.id, oldVoidedBill.id].sort(),
        tx,
      );
      expect(harness.projection.refresh).toHaveBeenCalledWith(scope, lifecycleAuth.userId, tx);
      expect(harness.audit.appendRequired).toHaveBeenCalledTimes(2);
      expect(harness.audit.appendRequired.mock.calls.every((call) => call[1] === tx)).toBe(true);
    });
  });

  it("取消有收款合同时在任何财务写入前要求当前读写权限", async () => {
    const activeBill = bill({
      id: "bill-permission-cancel",
      type: "monthly",
      sourceKey: "monthly:2026-08",
      billingMonth: "2026-08",
      lines: [line("rent_period", "月租", 300_000)],
    });
    const scenario = cancellationCase({
      bills: [activeBill],
      cashEntries: [cashEntry("deposit-receipt", "receipt", 300_000, activeBill.id)],
    });

    for (const missingPermission of [
      "rental_bills:read",
      "rental_bills:adjust",
      "rental_contracts:read",
      "rental_settlements:confirm",
    ] as const) {
      const auth: AuthContext = {
        ...lifecycleAuth,
        permissions: lifecycleAuth.permissions.filter(
          (permission) => permission !== missingPermission,
        ),
      };

      await withHarness(scenario.snapshot, async (harness) => {
        await expect(
          harness.service.onCancel(auth, scenario.before, scenario.after, tx),
        ).rejects.toMatchObject({ status: 403 });
        expect(harness.permissionCheck).toHaveBeenCalledWith(auth, missingPermission);
        expect(harness.bills.voidBills).not.toHaveBeenCalled();
        expect(harness.settlements.create).not.toHaveBeenCalled();
        expect(harness.settlements.linkBills).not.toHaveBeenCalled();
        expect(harness.projection.refresh).not.toHaveBeenCalled();
        expect(harness.audit.appendRequired).not.toHaveBeenCalled();
      });
    }
  });

  it.each([
    "projection",
    "audit",
  ] as const)("取消结算时透传必要的 %s 失败", async (failedOperation) => {
    const historicalBill = bill({
      id: "bill-old",
      type: "deposit",
      sourceKey: "deposit:historical",
      lines: [line("deposit", "历史押金", 300_000)],
      status: "voided",
    });
    const scenario = cancellationCase({
      bills: [historicalBill],
      cashEntries: [cashEntry("deposit-receipt", "receipt", 300_000, "bill-old")],
    });
    const failure = new Error(`${failedOperation} failed`);

    await withHarness(scenario.snapshot, async (harness) => {
      if (failedOperation === "projection") {
        harness.projection.refresh.mockRejectedValueOnce(failure);
      } else {
        harness.audit.appendRequired.mockRejectedValueOnce(failure);
      }

      await expect(
        harness.service.onCancel(lifecycleAuth, scenario.before, scenario.after, tx),
      ).rejects.toBe(failure);
      if (failedOperation === "projection") {
        expect(harness.projection.refresh).toHaveBeenCalledWith(
          { organizationId: scenario.before.organizationId, contractId: financeContractId },
          lifecycleAuth.userId,
          tx,
        );
        expect(harness.audit.appendRequired).not.toHaveBeenCalled();
      } else {
        expect(harness.projection.refresh).toHaveBeenCalled();
        expect(harness.audit.appendRequired).toHaveBeenCalledWith(
          expect.objectContaining({ action: "rental_settlement.confirmed" }),
          tx,
        );
      }
    });
  });

  it("预约终止和撤销未来终止继续接受调用方事务且不触发财务写入", async () => {
    const scenario = cancellationCase();

    await withHarness(scenario.snapshot, async (harness) => {
      await expect(
        harness.service.onTerminate(lifecycleAuth, scenario.before, scenario.before, tx),
      ).resolves.toBeUndefined();
      await expect(
        harness.service.onRevokeTermination(lifecycleAuth, scenario.before, scenario.before, tx),
      ).resolves.toBeUndefined();

      expect(harness.sources.read).not.toHaveBeenCalled();
      expect(harness.permissionCheck).not.toHaveBeenCalled();
      expect(harness.billRevisions.append).not.toHaveBeenCalled();
      expect(harness.bills.voidBills).not.toHaveBeenCalled();
      expect(harness.settlements.create).not.toHaveBeenCalled();
      expect(harness.settlements.linkBills).not.toHaveBeenCalled();
      expect(harness.projection.refresh).not.toHaveBeenCalled();
      expect(harness.audit.appendRequired).not.toHaveBeenCalled();
    });
  });
});
