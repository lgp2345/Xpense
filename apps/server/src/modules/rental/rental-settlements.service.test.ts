import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { expect, it, vi } from "vitest";
import { rentalFinanceAuth, rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { RentalSettlementsService } from "./rental-settlements.service.js";

function harness() {
  const source = rentalFinanceSnapshot();
  source.context.today = "2026-12-31";
  const requests = { find: vi.fn(async () => null), complete: vi.fn() };
  const writer = { persist: vi.fn(async () => ({ id: "settlement", finalCostMinor: 1 })) };
  const read = vi.fn(async () => source);
  const run = vi.fn(async (operation) => operation({}));
  const access = { assertPermission: vi.fn() };
  const service = new RentalSettlementsService(
    { read } as never,
    { history: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }) } as never,
    writer as never,
    { findGeneration: async () => null } as never,
    requests as never,
    {
      find: async () => ({ propertyId: "property" }),
      findForUpdate: async () => ({ propertyId: "property" }),
    } as never,
    {
      lockOrganizationContext: async () => ({ today: source.context.today }),
      requireContract: (value: unknown) => {
        if (!value) throw new NotFoundException();
        return value;
      },
      requireOwnedPropertyForUpdate: async () => ({}),
    } as never,
    access as never,
    { appendRequired: vi.fn() } as never,
    { run } as never,
    { readMany: async () => [] } as never,
  );
  const input = {
    contractId: source.context.contractId,
    finalReadings: source.readings.map(({ kind, reading }) => ({
      kind,
      reading,
      readingDate: "2026-12-31",
    })),
    extraFees: [],
  };
  return { source, requests, writer, read, run, access, service, input };
}
it("缺少确认权限在事务与来源读取前拒绝", async () => {
  const h = harness();
  h.access.assertPermission.mockImplementation(() => {
    throw new ForbiddenException();
  });
  expect(() => h.service.preview(rentalFinanceAuth as never, h.input)).toThrow(ForbiddenException);
  expect(h.run).not.toHaveBeenCalled();
});
it("预览只读、不触发任何写入或审计，缺终读数不可确认", async () => {
  const h = harness();
  const preview = await h.service.preview(rentalFinanceAuth as never, h.input);
  expect(preview.canConfirm).toBe(true);
  expect(h.writer.persist).not.toHaveBeenCalled();
  expect(h.requests.complete).not.toHaveBeenCalled();
  const missing = await h.service.preview(rentalFinanceAuth as never, {
    contractId: h.input.contractId,
    extraFees: [],
  });
  expect(missing.missingFields).toEqual(["waterReading", "electricityReading"]);
});
it("确认绑定预览版本，过期或已结算拒绝，幂等重放返回当前结算", async () => {
  const h = harness();
  const preview = await h.service.preview(rentalFinanceAuth as never, h.input);
  const dto = { ...h.input, expectedVersion: preview.version, idempotencyKey: "key" };
  await expect(
    h.service.confirm(rentalFinanceAuth as never, { ...dto, expectedVersion: "stale" }),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(h.writer.persist).not.toHaveBeenCalled();
  await h.service.confirm(rentalFinanceAuth as never, dto);
  expect(h.writer.persist).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ finalCostMinor: preview.finalCostMinor }),
    expect.anything(),
    expect.anything(),
    expect.anything(),
  );
  h.source.settlement = { id: "settlement", finalCostMinor: preview.finalCostMinor } as never;
  const complete = h.requests.complete.mock.calls[0]![1];
  h.requests.find.mockResolvedValue({ ...h.source.context, ...complete } as never);
  await expect(h.service.confirm(rentalFinanceAuth as never, dto)).resolves.toMatchObject({
    id: "settlement",
  });
  expect(h.writer.persist).toHaveBeenCalledOnce();
});
it("公开累计资金溢出拒绝，不用净差额掩盖累计溢出", async () => {
  const h = harness();
  h.source.cashEntries = [
    { kind: "receipt", amountMinor: Number.MAX_SAFE_INTEGER, revokedAt: null },
    { kind: "receipt", amountMinor: 1, revokedAt: null },
    { kind: "refund", amountMinor: Number.MAX_SAFE_INTEGER, revokedAt: null },
  ] as never;
  await expect(h.service.preview(rentalFinanceAuth as never, h.input)).rejects.toMatchObject({
    status: 400,
  });
  expect(h.writer.persist).not.toHaveBeenCalled();
});
