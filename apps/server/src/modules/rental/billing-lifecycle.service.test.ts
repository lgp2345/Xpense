import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { expect, it, vi } from "vitest";
import { rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import { rentalFinanceAuth, rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { BillingLifecycleService } from "./billing-lifecycle.service.js";
import { buildDepositDrafts } from "./billing-source.rules.js";
import { BillingStartsRepository } from "./billing-starts.repository.js";
import { BillsRepository } from "./bills.repository.js";
import type { MutableContractAggregate } from "./contract-lifecycle.service.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { SettlementWriteService } from "./settlement-write.service.js";

async function harness() {
  const source = rentalBillingSource();
  const finance = rentalFinanceSnapshot();
  const voidBills = vi.fn();
  const invalidate = vi.fn();
  const access = { assertPermission: vi.fn() };
  const persist = vi.fn(async () => ({ id: "settlement" }));
  const module = await Test.createTestingModule({
    providers: [
      BillingLifecycleService,
      { provide: BillsRepository, useValue: { voidBills } },
      { provide: AuditService, useValue: { appendRequired: vi.fn() } },
      { provide: AccessService, useValue: access },
      { provide: BillingStartsRepository, useValue: { invalidate } },
      { provide: RentalFinanceSourceService, useValue: { read: async () => finance } },
      { provide: SettlementWriteService, useValue: { persist } },
    ],
  }).compile();
  return {
    source,
    finance,
    voidBills,
    invalidate,
    persist,
    access,
    module,
    service: module.get(BillingLifecycleService),
  };
}
it("有有效普通账单时拒绝核心计费更正，仅时分秒变化不改变日计费", async () => {
  const h = await harness();
  h.source.activeBills = [{ id: "bill", type: "period", status: "active" }] as never;
  const aggregate = {
    ...h.source.contract,
    startDate: "2026-01-01T12:30:00",
    endDate: "2026-12-31T18:00:00",
  } as unknown as MutableContractAggregate;
  expect(() =>
    h.service.assertCorrectionAllowed(rentalFinanceAuth as never, h.source, aggregate),
  ).not.toThrow();
  expect(() =>
    h.service.assertCorrectionAllowed(rentalFinanceAuth as never, h.source, {
      ...aggregate,
      rentAmountMinor: 400000,
    }),
  ).toThrow(ConflictException);
  expect(() =>
    h.service.assertCorrectionAllowed(rentalFinanceAuth as never, h.source, {
      ...aggregate,
      spaces: [{ spaceId: "other", rentAllocationMinor: undefined }],
    }),
  ).toThrow(ConflictException);
  await h.module.close();
});
it("全部普通账单作废后边界更正使接续失效，保留审计", async () => {
  const h = await harness();
  await h.service.onCorrection(
    rentalFinanceAuth as never,
    h.source,
    { ...h.source, contract: { ...h.source.contract, startDate: "2026-02-01" } },
    {} as never,
  );
  expect(h.invalidate).toHaveBeenCalledOnce();
  expect(h.voidBills).not.toHaveBeenCalled();
  await h.module.close();
});
it("押金业务身份相同的UUID重建重排不作废，改变来源保留原资金目标", async () => {
  const h = await harness();
  const drafts = buildDepositDrafts(h.source.contract.depositTerms, {});
  h.source.activeBills = drafts.map((draft, index) => ({
    ...draft,
    id: `deposit-${index}`,
    status: "active",
  })) as never;
  await h.service.onCorrection(
    rentalFinanceAuth as never,
    h.source,
    {
      ...h.source,
      contract: {
        ...h.source.contract,
        depositTerms: h.source.contract.depositTerms
          .map((term) => ({ ...term, id: "rebuilt" }))
          .toReversed(),
      },
    },
    {} as never,
  );
  expect(h.voidBills).not.toHaveBeenCalled();
  await h.service.onCorrection(
    rentalFinanceAuth as never,
    h.source,
    { ...h.source, contract: { ...h.source.contract, depositTerms: [] } },
    {} as never,
  );
  expect(h.voidBills).toHaveBeenCalledWith(
    expect.anything(),
    ["deposit-0", "deposit-1"],
    "合同押金来源更正",
    expect.anything(),
  );
  await h.module.close();
});
it("预约终止与撤销不改写账单，确认结算之后拒绝生命周期变化", async () => {
  const h = await harness();
  await h.service.onTerminate(rentalFinanceAuth as never, h.source, {} as never, {} as never);
  await h.service.onRevokeTermination(rentalFinanceAuth as never, h.source, {} as never);
  expect(h.voidBills).not.toHaveBeenCalled();
  h.finance.settlement = { id: "settlement" } as never;
  await expect(
    h.service.onRevokeTermination(rentalFinanceAuth as never, h.source, {} as never),
  ).rejects.toBeInstanceOf(ConflictException);
  await h.module.close();
});
it("起租前取消保留收款事实并形成零成本退款结算", async () => {
  const h = await harness();
  h.finance.bills = [{ id: "deposit", type: "deposit", status: "active" }] as never;
  h.finance.cashEntries = [
    { id: "receipt", kind: "receipt", amountMinor: 5000, revokedAt: null },
  ] as never;
  await h.service.onCancel(
    rentalFinanceAuth as never,
    h.source,
    { ...h.source, cancelledOn: "2025-12-31" },
    {} as never,
  );
  expect(h.voidBills).toHaveBeenCalled();
  expect(h.persist).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ kind: "cancellation", finalCostMinor: 0, differenceMinor: -5000 }),
    [],
    expect.anything(),
    expect.anything(),
  );
  expect(h.finance.cashEntries).toHaveLength(1);
  await h.module.close();
});
