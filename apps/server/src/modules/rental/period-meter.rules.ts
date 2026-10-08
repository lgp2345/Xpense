import type { RentalFinanceSnapshot, RentalMeterReading } from "./rental-finance.types.js";
/** 只沿有效账单快照选前驱，作废或孤立读数不能推进基准。 */
export function resolvePeriodMeterBaselines(source: RentalFinanceSnapshot): RentalMeterReading[] {
  const spaceId = source.contract.spaces[0]?.spaceId;
  const active = source.bills
    .filter((bill) => bill.type === "period" && bill.status === "active")
    .toSorted((a, b) => (b.periodStart ?? "").localeCompare(a.periodStart ?? ""));
  return (["water", "electricity"] as const).flatMap((kind) => {
    if (!source.terms?.[`${kind}CollectionEnabled`]) return [];
    for (const bill of active) {
      const fee = bill.lines.find((line) => line.feeSnapshot?.kind === kind)?.feeSnapshot;
      if (!fee || !("endReadingId" in fee)) continue;
      const reading = source.readings.find(
        (reading) =>
          reading.id === fee.endReadingId &&
          reading.kind === kind &&
          reading.spaceId === spaceId &&
          reading.contractId === source.context.contractId &&
          reading.billId === bill.id &&
          reading.source === "bill",
      );
      if (!reading) throw new RangeError("有效账单缺少作用域一致的读数快照");
      return [reading];
    }
    const reading =
      source.billingStart?.baselineReadings.find(
        (reading) => reading.kind === kind && reading.spaceId === spaceId,
      ) ??
      source.readings.find(
        (reading) =>
          reading.kind === kind &&
          reading.spaceId === spaceId &&
          reading.contractId === source.context.contractId &&
          reading.source === "contract",
      );
    return reading ? [reading] : [];
  });
}
