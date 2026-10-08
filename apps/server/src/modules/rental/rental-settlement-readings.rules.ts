import type { PreviewRentalSettlementRequest, RentalMeterKind } from "@xpense/shared";
import type { MeterReadingWriteInput } from "./meter-readings.repository.js";
import { parseCalendarDate } from "./contract-date.rules.js";
import { resolvePeriodMeterBaselines } from "./period-meter.rules.js";
import { parseDecimal4 } from "./rental-decimal.rules.js";
import type { RentalFinanceSnapshot, RentalMeterReading } from "./rental-finance.types.js";
export type SettlementReadingCandidate = {
  reading: RentalMeterReading;
  write: MeterReadingWriteInput;
};
/** 最终读数只能延续最后有效普通账单，不按抄表日期寻找前驱。 */
export function assertSettlementReadingMonotonicity(
  source: RentalFinanceSnapshot,
  requested: { kind: RentalMeterKind; readingDate: string; reading: string },
  spaceId: string,
): void {
  const previous = resolvePeriodMeterBaselines(source).find(
    (reading) => reading.kind === requested.kind && reading.spaceId === spaceId,
  );
  if (!previous) throw new RangeError("结算缺少水电起算基准");
  if (
    requested.readingDate < previous.readingDate ||
    parseDecimal4(requested.reading) < parseDecimal4(previous.reading)
  )
    throw new RangeError("末次读数不能低于最后有效账单基准");
}
export function proposeSettlementReadings(
  source: RentalFinanceSnapshot,
  input: PreviewRentalSettlementRequest,
  idFactory: (index: number) => string = (index) => `terminal:${index}`,
): SettlementReadingCandidate[] {
  if (source.contract.lifecycleStatus === "cancelled") return [];
  const spaceId = source.contract.spaces.length === 1 ? source.contract.spaces[0]?.spaceId : null;
  if (!spaceId) throw new RangeError("结算需要唯一合同空间");
  const end = source.contract.terminationDate ?? source.contract.endDate;
  if (!end) throw new RangeError("缺少结束日期");
  const baselines = resolvePeriodMeterBaselines(source);
  const kinds = new Set<RentalMeterKind>();
  return (input.finalReadings ?? [])
    .filter((reading) => source.terms?.[`${reading.kind}CollectionEnabled`] !== false)
    .map((input, index) => {
      if (kinds.has(input.kind)) throw new RangeError("结算读数类型不能重复");
      kinds.add(input.kind);
      parseCalendarDate(input.readingDate);
      parseDecimal4(input.reading);
      if (input.readingDate !== end || input.readingDate > source.context.today)
        throw new RangeError("末次抄表日期必须为已生效的实际结束日");
      assertSettlementReadingMonotonicity(source, input, spaceId);
      const previous = baselines.find((reading) => reading.kind === input.kind)!;
      const write: MeterReadingWriteInput = {
        ...input,
        spaceId,
        predecessorId: previous.id,
        source: "settlement",
      };
      return {
        write,
        reading: {
          ...input,
          spaceId,
          predecessorId: previous.id,
          contractId: source.context.contractId,
          id: idFactory(index),
          revision: 1,
          source: "settlement",
          billingStartId: null,
          billId: null,
          settlementId: "pending",
        },
      };
    });
}
