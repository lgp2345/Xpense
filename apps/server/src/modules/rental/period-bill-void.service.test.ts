import { ConflictException } from "@nestjs/common";
import { expect, it, vi } from "vitest";
import { rentalFinanceAuth, rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { PeriodBillVoidService } from "./period-bill-void.service.js";
import { financeSourceVersion } from "./rental-finance-request.rules.js";

function harness() {
  const source = rentalFinanceSnapshot();
  const bill = {
    id: "bill",
    contractId: source.context.contractId,
    type: "period",
    status: "active",
    periodStart: "2026-01-01",
  };
  source.bills = [bill] as never;
  let saved: unknown = null;
  const bills = {
    detail: async () => bill,
    findGeneration: async () => null,
    voidBills: vi.fn(async () => {
      bill.status = "voided";
    }),
  };
  const requests = {
    find: async () => saved,
    complete: async (scope: object, input: object) => {
      saved = { ...scope, ...input };
    },
  };
  const service = new PeriodBillVoidService(
    { read: async () => source } as never,
    bills as never,
    { find: async () => ({ propertyId: "property" }), findForUpdate: async () => ({}) } as never,
    {
      lockOrganizationContext: async () => ({ today: "2026-08-31" }),
      requireContract: (value: unknown) => value,
      requireOwnedPropertyForUpdate: async () => ({}),
    } as never,
    requests as never,
    { assertPermission: vi.fn() } as never,
    { appendRequired: vi.fn() } as never,
    { run: (operation: (tx: object) => Promise<unknown>) => operation({}) } as never,
  );
  return {
    source,
    bill,
    bills,
    service,
    dto: {
      billId: "bill",
      reason: "核对后重开",
      expectedVersion: financeSourceVersion(source, { billId: "bill" }),
      idempotencyKey: "void-key",
    },
  };
}
it("锁内作废并记录幂等，重复请求只返回当前状态", async () => {
  const h = harness();
  await expect(h.service.void(rentalFinanceAuth as never, h.dto)).resolves.toMatchObject({
    status: "voided",
  });
  await h.service.void(rentalFinanceAuth as never, h.dto);
  expect(h.bills.voidBills).toHaveBeenCalledOnce();
});
it("同键不同内容、资金变化和过期版本拒绝", async () => {
  const h = harness();
  await h.service.void(rentalFinanceAuth as never, h.dto);
  await expect(
    h.service.void(rentalFinanceAuth as never, { ...h.dto, reason: "另一原因" }),
  ).rejects.toBeInstanceOf(ConflictException);
  const another = harness();
  await expect(
    another.service.void(rentalFinanceAuth as never, { ...another.dto, expectedVersion: "stale" }),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(another.bills.voidBills).not.toHaveBeenCalled();
});
