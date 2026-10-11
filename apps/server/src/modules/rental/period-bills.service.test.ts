import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { rentalFinanceAuth, rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { PeriodBillsService } from "./period-bills.service.js";

function harness() {
  const snapshot = rentalFinanceSnapshot();
  snapshot.contract.paymentIntervalMonths = 1;
  const tx = {};
  let saved: unknown = null;
  const bill = { id: "bill", status: "active", contractId: snapshot.context.contractId };
  const writes: string[] = [];
  const bills = {
    findGeneration: async () => null,
    createGeneration: vi.fn(async () => {
      writes.push("generation");
      return { id: "generation" };
    }),
    insertPeriodHeader: vi.fn(
      async (
        ..._args: Parameters<import("./bills.repository.js").BillsRepository["insertPeriodHeader"]>
      ) => {
        writes.push("header");
        return bill;
      },
    ),
    insertPeriodLines: vi.fn(
      async (
        ..._args: Parameters<import("./bills.repository.js").BillsRepository["insertPeriodLines"]>
      ) => {
        writes.push("lines");
      },
    ),
    detail: async () => bill,
  };
  const readings = {
    appendBoundary: vi.fn(async (scope: object, input: { kind: string }) => {
      writes.push(input.kind);
      return { ...scope, ...input, id: `real-${input.kind}` };
    }),
  };
  const starts = {
    create: vi.fn(async () => {
      writes.push("start");
      return { baselineReadings: [] };
    }),
  };
  const requests = {
    find: async (_scope: object, key: string) =>
      (saved as { idempotencyKey: string } | null)?.idempotencyKey === key ? saved : null,
    complete: vi.fn(async (scope: object, input: { kind: string }) => {
      saved = { ...scope, ...input };
      writes.push("request");
    }),
  };
  const sources = { read: vi.fn(async () => snapshot) };
  const contracts = {
    find: async () => ({ propertyId: "property" }),
    findForUpdate: async () => ({ propertyId: "property" }),
  };
  const policy = {
    requireContract: (value: unknown) => value,
    lockOrganizationContext: async () => ({ today: snapshot.context.today }),
    requireOwnedPropertyForUpdate: async () => ({ id: "property" }),
  };
  const audit = {
    appendRequired: vi.fn(async () => {
      writes.push("audit");
    }),
  };
  const service = new PeriodBillsService(
    sources as never,
    bills as never,
    readings as never,
    starts as never,
    requests as never,
    contracts as never,
    policy as never,
    { assertPermission: vi.fn() } as never,
    audit as never,
    { run: (operation: (tx: object) => Promise<unknown>) => operation(tx) } as never,
  );
  const input = {
    contractId: snapshot.context.contractId,
    periodStart: "2026-01-01",
    dueDate: "2026-01-01",
    readings: snapshot.readings.map(({ kind, reading }) => ({
      kind,
      reading,
    })),
    extraFees: [],
  };
  return {
    service,
    snapshot,
    bill,
    bills,
    readings,
    starts,
    requests,
    audit,
    writes,
    input,
    sources,
    tx,
  };
}
describe("账期生成事务", () => {
  it("预览不分配账单号、不写起点与读数", async () => {
    const h = harness();
    await h.service.preview(rentalFinanceAuth as never, h.input);
    expect(h.writes).toEqual([]);
  });
  it("先头后读数后明细，重放只返回原账单当前状态", async () => {
    const h = harness();
    const preview = await h.service.preview(rentalFinanceAuth as never, h.input);
    const dto = { ...h.input, expectedVersion: preview.version, idempotencyKey: "key" };
    await h.service.generate(rentalFinanceAuth as never, dto);
    expect(h.writes).toEqual([
      "start",
      "generation",
      "header",
      "water",
      "electricity",
      "lines",
      "audit",
      "request",
    ]);
    const lines = h.bills.insertPeriodLines.mock.calls[0]![2];
    expect(lines.find((line) => line.kind === "water")?.feeSnapshot).toMatchObject({
      endReadingId: "real-water",
    });
    h.bill.status = "voided";
    await expect(h.service.generate(rentalFinanceAuth as never, dto)).resolves.toMatchObject({
      status: "voided",
    });
    expect(h.writes).toHaveLength(8);
  });
  it("整体备注改变预览版本并传入账单头草案", async () => {
    const h = harness();
    const withNote = { ...h.input, note: "本期整体说明" };
    const preview = await h.service.preview(rentalFinanceAuth as never, withNote as never);
    const withoutNote = await h.service.preview(rentalFinanceAuth as never, h.input);
    expect(preview.version).not.toBe(withoutNote.version);

    await h.service.generate(
      rentalFinanceAuth as never,
      {
        ...withNote,
        expectedVersion: preview.version,
        idempotencyKey: "note-key",
      } as never,
    );
    expect(h.bills.insertPeriodHeader.mock.calls[0]?.[3]).toMatchObject({ note: "本期整体说明" });
  });
  it("相同幂等键使用不同整体备注会冲突", async () => {
    const h = harness();
    const first = { ...h.input, note: "第一份备注" };
    const preview = await h.service.preview(rentalFinanceAuth as never, first as never);
    await h.service.generate(
      rentalFinanceAuth as never,
      {
        ...first,
        expectedVersion: preview.version,
        idempotencyKey: "note-replay-key",
      } as never,
    );
    await expect(
      h.service.generate(
        rentalFinanceAuth as never,
        {
          ...first,
          note: "不同备注",
          expectedVersion: preview.version,
          idempotencyKey: "note-replay-key",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("相同键不同内容和来源版本变化拒绝", async () => {
    const h = harness();
    const preview = await h.service.preview(rentalFinanceAuth as never, h.input);
    await h.service.generate(rentalFinanceAuth as never, {
      ...h.input,
      expectedVersion: preview.version,
      idempotencyKey: "key",
    });
    await expect(
      h.service.generate(rentalFinanceAuth as never, {
        ...h.input,
        dueDate: "2026-01-02",
        expectedVersion: preview.version,
        idempotencyKey: "key",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    h.snapshot.terms!.waterUnitPrice = "4";
    await expect(
      h.service.generate(rentalFinanceAuth as never, {
        ...h.input,
        expectedVersion: preview.version,
        idempotencyKey: "other",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("过期预览不得推进下一期", async () => {
    const h = harness();
    const preview = await h.service.preview(rentalFinanceAuth as never, h.input);
    h.snapshot.bills.push({
      id: "existing",
      type: "period",
      status: "active",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      lines: [],
    } as never);
    await expect(
      h.service.generate(rentalFinanceAuth as never, {
        ...h.input,
        expectedVersion: preview.version,
        idempotencyKey: "key",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.writes).toEqual([]);
  });
  it("context分页不改变下一账期", async () => {
    const h = harness();
    const result = await h.service.context(rentalFinanceAuth as never, {
      contractId: h.input.contractId,
      page: 2,
      pageSize: 2,
    });
    expect(result.nextPeriod).toEqual({ periodStart: "2026-01-01", periodEnd: "2026-01-31" });
    expect(result.selectablePeriods.items[0]?.periodStart).toBe("2026-03-01");
  });
});
