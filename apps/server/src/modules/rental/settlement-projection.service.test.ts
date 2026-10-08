import { expect, it, vi } from "vitest";
import { SettlementProjectionService } from "./settlement-projection.service.js";

it("资金刷新保留独立尾期水电和退款事项，不从普通账单重新归集费用", async () => {
  const scope = { organizationId: "org", contractId: "contract" };
  const snapshot = {
    effectiveEndDate: "2026-12-31",
    periodCharges: [],
    terminalLines: [{ kind: "water", amountMinor: 8000 }],
    extraLines: [{ kind: "extra_fee", amountMinor: -2000 }],
    finalCostMinor: 6000,
    differenceMinor: 6000,
    receivedMinor: 0,
    refundedMinor: 0,
    kind: "expiry",
    version: "v",
    billIds: [],
  };
  let current = {
    ...scope,
    id: "settlement",
    eventId: "event",
    kind: "expiry",
    effectiveEndDate: "2026-12-31",
    revision: 1,
    finalCostMinor: 6000,
    status: "pending_collection",
    snapshot,
    version: "v",
    confirmedAt: new Date(),
    confirmedByUserId: "user",
  };
  const facts = {
    ...scope,
    contract: { lifecycleStatus: "confirmed", terminationDate: null },
    bills: [],
    cashEntries: [
      {
        id: "cash",
        contractId: "contract",
        settlementId: "settlement",
        billId: null,
        kind: "receipt",
        purpose: "rent",
        amountMinor: 6000,
        occurredOn: "2026-12-31",
        revokedAt: null,
      },
    ],
    settlement: { ...current },
    settlementBillIds: [],
    readings: [],
  };
  const settlements = {
    findCurrent: async () => current,
    revise: vi.fn(async (_scope, _id, projection) => {
      current = {
        ...current,
        revision: current.revision + 1,
        status: projection.status,
        version: projection.version,
        snapshot: projection.plan,
      };
      facts.settlement = { ...current };
      return current;
    }),
  };
  const service = new SettlementProjectionService(
    { readMany: async () => [facts] } as never,
    settlements as never,
  );
  const result = await service.refresh(scope, "user", {} as never);
  expect(result?.finalCostMinor).toBe(6000);
  expect(result?.balance.outstandingMinor).toBe(0);
  expect(current.snapshot.terminalLines).toEqual(snapshot.terminalLines);
  expect(current.snapshot.extraLines).toEqual(snapshot.extraLines);
});
