import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { rentalBillingDetail, rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillAdjustmentsRepository } from "./bill-adjustments.repository.js";
import { normalBillingDrafts } from "./billing-plan.rules.js";
import { billingFingerprint } from "./billing-source.rules.js";
import { BillingSourceService } from "./billing-source.service.js";
import { BillingTerminationService } from "./billing-termination.service.js";
import { BillsRepository } from "./bills.repository.js";
import type { NewAdjustment } from "./bills.repository.types.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";

const auth: AuthContext = {
  organizationId: "org",
  userId: "user",
  sessionId: "session",
  isSuperAdmin: false,
  permissions: ["rental_contracts:read", "rental_bills:read", "rental_bills:adjust"],
};
async function harness(history = true, existing = true) {
  const source = rentalBillingSource();
  if (existing)
    source.activeBills = normalBillingDrafts(source, {}).map((draft) =>
      rentalBillingDetail(source, draft),
    );
  const bills = {
    hasHistory: vi.fn().mockResolvedValue(history),
    voidBills: vi.fn(),
    createGeneration: vi.fn().mockResolvedValue({ id: randomUUID() }),
    insertBills: vi.fn(),
  };
  const adjustments = {
    insert: vi.fn(async (input: NewAdjustment) => ({
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
      revokedAt: null,
    })),
    revoke: vi.fn(),
  };
  const module = await Test.createTestingModule({
    providers: [
      BillingTerminationService,
      { provide: BillAdjustmentsRepository, useValue: adjustments },
      { provide: BillsRepository, useValue: bills },
      { provide: BillingSourceService, useValue: { read: async () => source } },
      {
        provide: ContractsRepository,
        useValue: {
          find: async () => ({ propertyId: source.contract.propertyId }),
          findForUpdate: async () => ({}),
        },
      },
      {
        provide: ContractsPolicyService,
        useValue: {
          lockOrganizationContext: async () => ({ today: source.today }),
          requireOwnedPropertyForUpdate: vi.fn(),
          requireContract: (value: unknown) => value,
        },
      },
      {
        provide: DatabaseTransactionService,
        useValue: { run: async (fn: (tx: never) => unknown) => fn({} as never) },
      },
      { provide: AccessService, useValue: { assertPermission: vi.fn() } },
      { provide: AuditService, useValue: { appendRequired: vi.fn() } },
    ],
  }).compile();
  return { source, bills, adjustments, module, service: module.get(BillingTerminationService) };
}
describe("终止财务确认", () => {
  it("原季付 900000、参考 450000、最终 500000；保留原行并记 -400000 差额", async () => {
    const h = await harness();
    const dto = {
      id: h.source.contract.id,
      terminationDate: "2026-11-15",
      reason: "协商终止",
      billingConfirmation: {
        expectedVersion: billingFingerprint(h.source, { terminationDate: "2026-11-15" }),
        finalAmountMinor: 500000,
        reason: "协商整期应收",
      },
    };
    const preview = await h.service.previewTermination(auth, {
      contractId: dto.id,
      terminationDate: dto.terminationDate,
    });
    expect(preview).toMatchObject({
      originalAmountMinor: 900000,
      referenceAmountMinor: 450000,
      requiresConfirmation: true,
    });
    await h.service.onTerminate(auth, h.source, dto, {} as never, new Date("2026-09-28T00:00:00Z"));
    expect(h.bills.voidBills.mock.calls[0]?.[1]).toEqual([h.source.activeBills[3]?.id]);
    expect(h.bills.insertBills.mock.calls[0]?.[3]).toMatchObject([
      {
        amountMinor: 500000,
        effectiveEnd: "2026-11-15",
        lines: [
          { amountMinor: 300000 },
          { amountMinor: 300000 },
          { amountMinor: 300000 },
          { kind: "termination_adjustment", amountMinor: -400000 },
        ],
      },
    ]);
    expect(h.adjustments.insert.mock.calls[0]?.[0]).toMatchObject({
      referenceAmountMinor: 450000,
      finalAmountMinor: 500000,
      terminationRecordedAt: new Date("2026-09-28T00:00:00Z"),
    });
    await h.module.close();
  });
  it("无历史旧终止无需财务字段；有历史但当期缺失只保存调整；零额合法", async () => {
    const h = await harness(false, false);
    const dto = { id: h.source.contract.id, terminationDate: "2026-06-30", reason: "终止" };
    await h.service.onTerminate(auth, h.source, dto, {} as never);
    expect(h.adjustments.insert).not.toHaveBeenCalled();
    h.bills.hasHistory.mockResolvedValue(true);
    await expect(h.service.onTerminate(auth, h.source, dto, {} as never)).rejects.toMatchObject({
      status: 400,
    });
    await h.service.onTerminate(
      auth,
      h.source,
      {
        ...dto,
        billingConfirmation: {
          expectedVersion: billingFingerprint(h.source, { terminationDate: dto.terminationDate }),
          finalAmountMinor: 0,
          reason: "免除当期",
        },
      },
      {} as never,
    );
    expect(h.adjustments.insert).toHaveBeenCalledOnce();
    expect(h.bills.insertBills).not.toHaveBeenCalled();
    await h.module.close();
  });
  it("撤销匹配事件，旧账单不复活；日期相同但记录时间不同拒绝", async () => {
    const h = await harness();
    h.source.contract.lifecycleStatus = "terminated";
    h.source.contract.terminationDate = "2026-11-15";
    h.source.terminationRecordedAt = "2026-09-28T00:00:00.000Z";
    h.source.adjustment = {
      id: randomUUID(),
      contractId: h.source.contract.id,
      terminationDate: "2026-11-15",
      terminationRecordedAt: h.source.terminationRecordedAt,
      periodStart: "2026-10-01",
      periodEnd: "2026-12-31",
      originalAmountMinor: 900000,
      referenceAmountMinor: 450000,
      finalAmountMinor: 500000,
      reason: "终止",
      createdAt: h.source.terminationRecordedAt,
      revokedAt: null,
    };
    const current = h.source.activeBills[3];
    if (current) current.adjustmentId = h.source.adjustment.id;
    await h.service.onRevokeTermination(auth, h.source, {} as never);
    expect(h.adjustments.revoke).toHaveBeenCalledOnce();
    expect(h.bills.voidBills.mock.calls[0]?.[1]).toEqual([current?.id]);
    h.source.terminationRecordedAt = "2026-09-28T01:00:00.000Z";
    await expect(h.service.onRevokeTermination(auth, h.source, {} as never)).rejects.toMatchObject({
      status: 409,
    });
    await h.module.close();
  });
});
