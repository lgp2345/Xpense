import type { RentalBillLine } from "@xpense/shared";
import {
  addCalendarDays,
  calendarDateToDayNumber,
  daysInMonth,
  parseCalendarDate,
} from "./contract-date.rules.js";
import { calculateMeterCharge } from "./rental-decimal.rules.js";
import type {
  MonthlyChargeInput,
  MonthlyChargeResult,
  RentalMeterReading,
} from "./rental-finance.types.js";
import { projectRentalRentThroughDate } from "./rental-rent-projection.rules.js";

const maximumSafeAmount = BigInt(Number.MAX_SAFE_INTEGER);

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function line(
  fields: Partial<RentalBillLine> & Pick<RentalBillLine, "kind" | "label" | "amountMinor">,
): RentalBillLine {
  return {
    periodStart: null,
    periodEnd: null,
    referenceStart: null,
    referenceEnd: null,
    coveredDays: null,
    referenceDays: null,
    baseRentAmountMinor: null,
    sortOrder: 0,
    ...fields,
  };
}

function meterLine(
  kind: "water" | "electricity",
  interval: { previous: RentalMeterReading; current: RentalMeterReading },
  unitPrice: string,
  overrideReason: string | null,
): RentalBillLine {
  const { previous, current } = interval;
  if (previous.kind !== kind || current.kind !== kind || current.predecessorId !== previous.id) {
    throw new RangeError("水电计费读数边界无效");
  }
  if (previous.readingDate >= current.readingDate) throw new RangeError("水电抄表日期顺序无效");
  const amountMinor = calculateMeterCharge(previous.reading, current.reading, unitPrice);
  return line({
    kind,
    label: kind === "water" ? "水费" : "电费",
    amountMinor,
    periodStart: previous.readingDate,
    periodEnd: current.readingDate,
    feeSnapshot: {
      kind,
      startReadingId: previous.id,
      endReadingId: current.id,
      startDate: previous.readingDate,
      endDate: current.readingDate,
      startReading: previous.reading,
      endReading: current.reading,
      unitPrice,
      overrideReason,
    },
  });
}

function fixedFeeLines(input: MonthlyChargeInput, leaseEnd: string): RentalBillLine[] {
  const monthStart = `${input.billingMonth}-01`;
  const monthEnd = addCalendarDays(
    monthStart,
    daysInMonth(parseCalendarDate(monthStart).year, parseCalendarDate(monthStart).month) - 1,
  );
  const periodStart =
    input.billingTerms.startDate > monthStart ? input.billingTerms.startDate : monthStart;
  const periodEnd = leaseEnd < monthEnd ? leaseEnd : monthEnd;
  if (periodStart > periodEnd) return [];

  const overrides = new Map(
    (input.overrides?.fixedFees ?? []).map((item) => [item.id, item.monthlyAmountMinor]),
  );
  const coveredDays =
    calendarDateToDayNumber(parseCalendarDate(periodEnd)) -
    calendarDateToDayNumber(parseCalendarDate(periodStart)) +
    1;
  const monthDays = daysInMonth(
    parseCalendarDate(monthStart).year,
    parseCalendarDate(monthStart).month,
  );

  return input.chargeTerms.fixedFees.map((fee) => {
    const amount = overrides.get(fee.id) ?? fee.monthlyAmountMinor;
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new RangeError("固定月费必须是非负安全整数");
    return line({
      kind: "fixed_fee",
      label: fee.name,
      amountMinor: Number(roundHalfUp(BigInt(amount) * BigInt(coveredDays), BigInt(monthDays))),
      periodStart,
      periodEnd,
      referenceStart: monthStart,
      referenceEnd: monthEnd,
      coveredDays,
      referenceDays: monthDays,
      feeSnapshot: {
        kind: "fixed_fee",
        feeId: fee.id,
        monthlyAmountMinor: amount,
        overrideReason: overrides.has(fee.id) ? (input.overrides?.reason ?? null) : null,
      },
    });
  });
}

function safeTotal(lines: RentalBillLine[]): number {
  const total = lines.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  if (total < 0n) throw new RangeError("综合账单应收金额不能为负数");
  if (total > maximumSafeAmount) throw new RangeError("综合账单金额超出安全整数范围");
  return Number(total);
}

/** 按稳定月份组合原始付款账期、实际表计区间和自然月固定费用。 */
export function calculateMonthlyCharges(input: MonthlyChargeInput): MonthlyChargeResult {
  parseCalendarDate(`${input.billingMonth}-01`);
  const leaseEnd = input.effectiveEndDate ?? input.billingTerms.endDate;
  parseCalendarDate(leaseEnd);
  if (leaseEnd < input.billingTerms.startDate || leaseEnd > input.billingTerms.endDate) {
    throw new RangeError("实际结束日期必须位于合同租期内");
  }

  const rent = projectRentalRentThroughDate(input.billingTerms, leaseEnd).find(
    (projection) => projection.billingMonth === input.billingMonth,
  );
  const lines: RentalBillLine[] = rent ? [...rent.lines] : [];
  for (const kind of ["water", "electricity"] as const) {
    const interval = input.readings[kind];
    if (!interval) continue;
    const unitPrice =
      input.overrides?.[kind === "water" ? "waterUnitPrice" : "electricityUnitPrice"] ??
      input.chargeTerms[kind === "water" ? "waterUnitPrice" : "electricityUnitPrice"];
    lines.push(
      meterLine(
        kind,
        interval,
        unitPrice,
        input.overrides?.[kind === "water" ? "waterUnitPrice" : "electricityUnitPrice"] ===
          undefined
          ? null
          : input.overrides.reason,
      ),
    );
  }
  lines.push(...fixedFeeLines(input, leaseEnd));
  for (const fee of input.extraFees) {
    if (!Number.isSafeInteger(fee.amountMinor)) throw new RangeError("额外费用必须是安全整数");
    lines.push(
      line({
        kind: "extra_fee",
        label: fee.name,
        amountMinor: fee.amountMinor,
        note: fee.note,
        feeSnapshot: { kind: "extra_fee", extraFeeId: fee.id, origin: "monthly" },
      }),
    );
  }
  const orderedLines = lines.map((item, sortOrder) => ({ ...item, sortOrder }));
  return { lines: orderedLines, amountMinor: safeTotal(orderedLines) };
}
