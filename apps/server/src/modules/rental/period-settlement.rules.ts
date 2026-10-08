import type {
  PreviewRentalSettlementRequest,
  RentalBillingPeriod,
  RentalBillLine,
  RentalSettlementKind,
} from "@xpense/shared";
import { prorateBillingAmount } from "./billing-period.rules.js";
import { calendarDateToDayNumber, parseCalendarDate } from "./contract-date.rules.js";
import { defaultPeriodChargeTerms, periodBillingTerms } from "./period-bill-plan.rules.js";
import {
  calculatePeriodCharges,
  chargeLine,
  periodMeterLine,
  safePeriodTotal,
} from "./period-charge.rules.js";
import { resolvePeriodMeterBaselines } from "./period-meter.rules.js";
import { billingPeriods } from "./period-schedule.rules.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { financeSourceVersion } from "./rental-finance-request.rules.js";
import { proposeSettlementReadings } from "./rental-settlement-readings.rules.js";
export type PeriodSettlementPlan = {
  effectiveEndDate: string;
  periodCharges: Array<{
    billId: string | null;
    period: RentalBillingPeriod;
    lines: RentalBillLine[];
    amountMinor: number;
  }>;
  terminalLines: RentalBillLine[];
  extraLines: RentalBillLine[];
  finalCostMinor: number;
  differenceMinor: number;
  receivedMinor: number;
  refundedMinor: number;
  kind: RentalSettlementKind;
  version: string;
  billIds: string[];
};
function signedTotal(lines: RentalBillLine[]): number {
  const total = lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError("结算金额超出安全整数范围");
  return Number(total);
}
export function settlementCashTotals(source: Pick<RentalFinanceSnapshot, "cashEntries">) {
  let received = 0n,
    refunded = 0n;
  for (const entry of source.cashEntries) {
    if (entry.revokedAt !== null) continue;
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0)
      throw new RangeError("有效资金必须为正安全整数");
    if (entry.kind === "receipt") received += BigInt(entry.amountMinor);
    else refunded += BigInt(entry.amountMinor);
  }
  if (received > BigInt(Number.MAX_SAFE_INTEGER) || refunded > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("合同有效资金超出安全整数范围");
  return { receivedMinor: Number(received), refundedMinor: Number(refunded) };
}
export function settlementStatus(difference: number) {
  return difference < 0
    ? ("pending_refund" as const)
    : difference > 0
      ? ("pending_collection" as const)
      : ("settled" as const);
}
export function settlementEvent(source: RentalFinanceSnapshot): {
  kind: RentalSettlementKind;
  effectiveEndDate: string;
} {
  if (source.contract.lifecycleStatus === "cancelled") {
    if (!source.cancelledOn) throw new RangeError("取消结算缺少正式取消日期");
    return { kind: "cancellation", effectiveEndDate: source.cancelledOn };
  }
  if (source.contract.lifecycleStatus === "terminated" && source.contract.terminationDate)
    return { kind: "termination", effectiveEndDate: source.contract.terminationDate };
  if (source.contract.lifecycleStatus === "confirmed" && source.contract.endDate)
    return { kind: "expiry", effectiveEndDate: source.contract.endDate };
  throw new RangeError("合同没有可结算的正式结束事件");
}
/** 租金在独立结算快照中按原参考月折算；固定费、水电和额外费保留原账单快照。 */
export function buildPeriodSettlementPlan(
  source: RentalFinanceSnapshot,
  input: PreviewRentalSettlementRequest,
): PeriodSettlementPlan {
  const event = settlementEvent(source);
  const cash = settlementCashTotals(source);
  const billIds = source.bills.map((bill) => bill.id).toSorted();
  const periodCharges: PeriodSettlementPlan["periodCharges"] = [];
  const terminalLines: RentalBillLine[] = [];
  if (event.kind !== "cancellation") {
    const terms = periodBillingTerms(source);
    const first = source.billingStart?.firstPeriodStart ?? terms.startDate;
    const rent = billingPeriods({
      terms,
      effectiveEndDate: event.effectiveEndDate,
      firstPeriodStart: first,
    });
    const active = source.bills.filter(
      (bill) => bill.type === "period" && bill.status === "active",
    );
    for (const bill of active) {
      if (!bill.periodStart || !bill.periodEnd) throw new RangeError("普通账单缺少账期");
      const lines = bill.lines
        .flatMap((line) => {
          if (line.kind !== "rent_period") return [line];
          if (
            !line.periodStart ||
            !line.periodEnd ||
            !line.referenceDays ||
            line.baseRentAmountMinor === null
          )
            throw new RangeError("已出账租金缺少原始计算片段");
          if (line.periodStart > event.effectiveEndDate) return [];
          if (line.periodEnd <= event.effectiveEndDate) return [line];
          const coveredDays =
            calendarDateToDayNumber(parseCalendarDate(event.effectiveEndDate)) -
            calendarDateToDayNumber(parseCalendarDate(line.periodStart)) +
            1;
          return [
            {
              ...line,
              periodEnd: event.effectiveEndDate,
              coveredDays,
              amountMinor: prorateBillingAmount(
                line.baseRentAmountMinor,
                coveredDays,
                line.referenceDays,
              ),
            },
          ];
        })
        .map((line, sortOrder) => ({ ...line, sortOrder }));
      periodCharges.push({
        billId: bill.id,
        period: { periodStart: bill.periodStart, periodEnd: bill.periodEnd },
        lines,
        amountMinor: signedTotal(lines),
      });
    }
    for (const draft of rent) {
      if (active.some((bill) => bill.periodStart === draft.periodStart)) continue;
      const calculated = calculatePeriodCharges({
        rent: draft,
        chargeTerms: defaultPeriodChargeTerms(source),
        readings: { water: null, electricity: null },
        extraFees: [],
      });
      periodCharges.push({
        billId: null,
        period: { periodStart: draft.periodStart, periodEnd: draft.periodEnd },
        ...calculated,
      });
    }
    const candidates = proposeSettlementReadings(source, input);
    const baselines = resolvePeriodMeterBaselines(source);
    for (const candidate of candidates) {
      const previous = baselines.find((reading) => reading.kind === candidate.reading.kind)!;
      const price = defaultPeriodChargeTerms(source)[`${candidate.reading.kind}UnitPrice`];
      terminalLines.push(
        periodMeterLine(
          candidate.reading.kind,
          { previous, current: candidate.reading },
          price,
          null,
        ),
      );
    }
  }
  const retainedIds = new Set(
    periodCharges.flatMap((charge) =>
      charge.lines.flatMap((line) =>
        line.feeSnapshot?.kind === "extra_fee" ? [line.feeSnapshot.extraFeeId] : [],
      ),
    ),
  );
  if (
    new Set(input.extraFees.map((fee) => fee.id)).size !== input.extraFees.length ||
    input.extraFees.some((fee) => retainedIds.has(fee.id))
  )
    throw new RangeError("结算事项标识重复或与有效账单冲突");
  const extraLines = input.extraFees.map((fee, sortOrder) => {
    if (!Number.isSafeInteger(fee.amountMinor)) throw new RangeError("结算事项必须是安全整数");
    return chargeLine({
      kind: "extra_fee",
      label: fee.name,
      amountMinor: fee.amountMinor,
      note: fee.note,
      sortOrder,
      feeSnapshot: { kind: "extra_fee", extraFeeId: fee.id, origin: "settlement" },
    });
  });
  const finalCostMinor = safePeriodTotal([
    ...periodCharges.flatMap((item) => item.lines),
    ...terminalLines,
    ...extraLines,
  ]);
  const difference =
    BigInt(finalCostMinor) - BigInt(cash.receivedMinor) + BigInt(cash.refundedMinor);
  if (difference > BigInt(Number.MAX_SAFE_INTEGER) || difference < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError("结算差额超出安全整数范围");
  return {
    ...event,
    periodCharges: periodCharges.toSorted((a, b) =>
      a.period.periodStart.localeCompare(b.period.periodStart),
    ),
    terminalLines,
    extraLines,
    finalCostMinor,
    differenceMinor: Number(difference),
    ...cash,
    version: financeSourceVersion(source, input),
    billIds,
  };
}
