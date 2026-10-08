import { expect, it, vi } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { buildPeriodSettlementPlan } from "./period-settlement.rules.js";
import { proposeSettlementReadings } from "./rental-settlement-readings.rules.js";
import { SettlementWriteService } from "./settlement-write.service.js";

it("先写结算头再写有所属终读数，快照替换真实ID且不改普通账单", async () => {
  const source = rentalFinanceSnapshot();
  source.context.today = "2026-12-31";
  const input = {
    contractId: source.context.contractId,
    extraFees: [],
    finalReadings: source.readings.map(({ kind, reading }) => ({
      kind,
      reading,
      readingDate: "2026-12-31",
    })),
  };
  const plan = buildPeriodSettlementPlan(source, input);
  const candidates = proposeSettlementReadings(source, input);
  const order: string[] = [];
  const settlements = {
    create: vi.fn(async () => {
      order.push("head");
      return { id: "settlement" };
    }),
    finalizeSnapshot: vi.fn(
      async (
        ..._args: Parameters<
          import("./rental-settlements.repository.js").RentalSettlementsRepository["finalizeSnapshot"]
        >
      ) => {
        order.push("snapshot");
      },
    ),
    linkBills: vi.fn(async () => {
      order.push("links");
    }),
  };
  const readings = {
    appendBoundary: vi.fn(async (_scope: object, input: { kind: string; settlementId: string }) => {
      order.push(input.kind);
      return { id: `real-${input.kind}` };
    }),
  };
  const projection = {
    refresh: vi.fn(async () => {
      order.push("projection");
      return { id: "settlement" };
    }),
  };
  const writer = new SettlementWriteService(
    settlements as never,
    readings as never,
    projection as never,
  );
  await writer.persist(
    { organizationId: source.context.organizationId, contractId: source.context.contractId },
    plan,
    candidates,
    { userId: "user" },
    {} as never,
  );
  expect(order).toEqual(["head", "water", "electricity", "snapshot", "links", "projection"]);
  expect(readings.appendBoundary.mock.calls[0]![1].settlementId).toBe("settlement");
  const snapshot = settlements.finalizeSnapshot.mock.calls[0]![2];
  expect(snapshot.terminalLines[0]?.feeSnapshot).toMatchObject({ endReadingId: "real-water" });
});
