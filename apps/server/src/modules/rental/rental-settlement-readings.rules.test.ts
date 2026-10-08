import { expect, it } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { proposeSettlementReadings } from "./rental-settlement-readings.rules.js";

it("即使同日同值也构造独立结算读数，不复用原节点", () => {
  const source = rentalFinanceSnapshot();
  source.context.today = "2026-12-31";
  source.readings = source.readings.map((reading) => ({ ...reading, readingDate: "2026-12-31" }));
  const before = structuredClone(source.readings);
  const candidates = proposeSettlementReadings(source, {
    contractId: source.context.contractId,
    extraFees: [],
    finalReadings: source.readings.map(({ kind, readingDate, reading }) => ({
      kind,
      readingDate,
      reading,
    })),
  });
  expect(candidates).toHaveLength(2);
  expect(candidates[0]?.reading.id).not.toBe(source.readings[0]?.id);
  expect(candidates[0]?.write.predecessorId).toBe(source.readings[0]?.id);
  expect(source.readings).toEqual(before);
});
it("日期只能为正式结束日，禁用代收不构造终值", () => {
  const source = rentalFinanceSnapshot();
  source.context.today = "2026-12-31";
  expect(() =>
    proposeSettlementReadings(source, {
      contractId: source.context.contractId,
      extraFees: [],
      finalReadings: [{ kind: "water", readingDate: "2026-12-30", reading: "110" }],
    }),
  ).toThrow(/实际结束日/);
  source.terms!.waterCollectionEnabled = false;
  expect(
    proposeSettlementReadings(source, {
      contractId: source.context.contractId,
      extraFees: [],
      finalReadings: [{ kind: "water", readingDate: "2026-12-31", reading: "110" }],
    }),
  ).toEqual([]);
});
