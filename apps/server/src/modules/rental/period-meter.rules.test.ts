import type { RentalBillDetail } from "@xpense/shared";
import { describe, expect, it } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { periodMeterLine } from "./period-charge.rules.js";
import { resolvePeriodMeterBaselines } from "./period-meter.rules.js";

describe("有效账单水电前驱", () => {
  it("作废尾期排除，恢复最后有效账单，不取日期或孤立读数", () => {
    const source = rentalFinanceSnapshot();
    const previous = source.readings[0]!;
    const first = {
      ...previous,
      id: "w1",
      source: "bill" as const,
      billId: "b1",
      predecessorId: previous.id,
      reading: "3600",
    };
    const tail = { ...first, id: "w2", billId: "b2", predecessorId: first.id, reading: "3680" };
    source.readings.push(first, tail);
    source.bills = [
      {
        id: "b1",
        type: "period",
        status: "active",
        periodStart: "2026-01-01",
        lines: [periodMeterLine("water", { previous, current: first }, "3", null)],
      },
      {
        id: "b2",
        type: "period",
        status: "voided",
        periodStart: "2026-02-01",
        lines: [periodMeterLine("water", { previous: first, current: tail }, "3", null)],
      },
    ] as RentalBillDetail[];
    expect(
      resolvePeriodMeterBaselines(source).find((reading) => reading.kind === "water")?.id,
    ).toBe("w1");
    source.bills[0]!.status = "voided";
    expect(
      resolvePeriodMeterBaselines(source).find((reading) => reading.kind === "water")?.id,
    ).toBe(previous.id);
  });
  it("接续起点优先于入住底数，禁用代收不要求读数", () => {
    const source = rentalFinanceSnapshot();
    source.billingStart = {
      id: "start",
      organizationId: source.context.organizationId,
      contractId: source.context.contractId,
      firstPeriodStart: "2026-10-01",
      version: 1,
      baselineReadings: [
        {
          ...source.readings[0]!,
          id: "start-water",
          source: "billing_start",
          billingStartId: "start",
          reading: "4200",
        },
      ],
    };
    source.terms!.electricityCollectionEnabled = false;
    expect(resolvePeriodMeterBaselines(source).map((reading) => reading.reading)).toEqual(["4200"]);
  });
});
