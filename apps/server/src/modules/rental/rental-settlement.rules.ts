import type {
  RentalBillDetail,
  RentalBillLine,
  RentalFeeSnapshot,
  RentalMeterKind,
} from "@xpense/shared";
import type { BillingTerms } from "./billing.types.js";
import {
  addCalendarDays,
  calendarDateToDayNumber,
  daysInMonth,
  parseCalendarDate,
} from "./contract-date.rules.js";
import { calculateMeterCharge, parseDecimal4 } from "./rental-decimal.rules.js";
import type {
  RentalFinanceSnapshot,
  RentalMeterReading,
  SettlementPlan,
} from "./rental-finance.types.js";
import { projectRentalRentThroughDate } from "./rental-rent-projection.rules.js";
import { assertSettlementReadingMonotonicity } from "./rental-settlement-readings.rules.js";

const maximum = BigInt(Number.MAX_SAFE_INTEGER);

type PlannedBill = { billId: string | null; billingMonth: string; lines: RentalBillLine[] };

function addLine(
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

function checkedAmount(lines: RentalBillLine[]): number {
  const amount = lines.reduce((total, item) => total + BigInt(item.amountMinor), 0n);
  if (amount < 0n) throw new RangeError("结算账单应收金额不能为负数");
  if (amount > maximum) throw new RangeError("结算账单金额超出安全整数范围");
  return Number(amount);
}

function monthEnd(month: string): string {
  const first = `${month}-01`;
  const { year, month: monthNumber } = parseCalendarDate(first);
  return addCalendarDays(first, daysInMonth(year, monthNumber) - 1);
}

function monthRange(startDate: string, endDate: string): string[] {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  const startIndex = start.year * 12 + start.month - 1;
  const endIndex = end.year * 12 + end.month - 1;
  const months: string[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    months.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
  }
  return months;
}

function billingTerms(source: RentalFinanceSnapshot): BillingTerms {
  const contract = source.contract;
  if (
    !contract.startDate ||
    !contract.endDate ||
    contract.rentAmountMinor === null ||
    contract.billingAnchor === null ||
    contract.paymentIntervalMonths === null ||
    contract.dueDaysBefore === null
  ) {
    throw new RangeError("合同租金账期信息不完整");
  }
  return {
    startDate: contract.startDate,
    endDate: contract.endDate,
    rentAmountMinor: contract.rentAmountMinor,
    billingAnchor: contract.billingAnchor,
    paymentIntervalMonths: contract.paymentIntervalMonths,
    dueDaysBefore: contract.dueDaysBefore,
  };
}

function fixedFeeLines(
  source: RentalFinanceSnapshot,
  billingMonth: string,
  effectiveEndDate: string,
): RentalBillLine[] {
  if (!source.terms) return [];
  const first = `${billingMonth}-01`;
  const last = monthEnd(billingMonth);
  const startDate = source.contract.startDate as string;
  const coveredStart = startDate > first ? startDate : first;
  const coveredEnd = effectiveEndDate < last ? effectiveEndDate : last;
  if (coveredStart > coveredEnd) return [];
  const coveredDays =
    calendarDateToDayNumber(parseCalendarDate(coveredEnd)) -
    calendarDateToDayNumber(parseCalendarDate(coveredStart)) +
    1;
  const referenceDays = daysInMonth(parseCalendarDate(first).year, parseCalendarDate(first).month);
  return source.terms.fixedFees.map((fee) => {
    if (!Number.isSafeInteger(fee.monthlyAmountMinor) || fee.monthlyAmountMinor < 0) {
      throw new RangeError("固定月费必须是非负安全整数");
    }
    const amountMinor = fee.monthlyAmountMinor;
    return addLine({
      kind: "fixed_fee",
      label: fee.name,
      amountMinor,
      periodStart: coveredStart,
      periodEnd: coveredEnd,
      referenceStart: first,
      referenceEnd: last,
      coveredDays,
      referenceDays,
      feeSnapshot: {
        kind: "fixed_fee",
        feeId: fee.id,
        calculationMode: "full_month",
        monthlyAmountMinor: fee.monthlyAmountMinor,
        overrideReason: null,
      },
    });
  });
}

function clipFixedFee(line: RentalBillLine, effectiveEndDate: string): RentalBillLine | null {
  const saved = line.feeSnapshot;
  if (saved?.kind !== "fixed_fee" || !line.periodStart || !line.periodEnd) {
    throw new RangeError("固定费用账单快照不完整");
  }
  if (line.periodStart > effectiveEndDate) return null;
  if (line.periodEnd <= effectiveEndDate) return line;
  const month = line.periodStart.slice(0, 7);
  const referenceDays =
    line.referenceDays ??
    daysInMonth(parseCalendarDate(`${month}-01`).year, parseCalendarDate(`${month}-01`).month);
  const coveredDays =
    calendarDateToDayNumber(parseCalendarDate(effectiveEndDate)) -
    calendarDateToDayNumber(parseCalendarDate(line.periodStart)) +
    1;
  if (!Number.isSafeInteger(referenceDays) || referenceDays <= 0 || coveredDays <= 0) {
    throw new RangeError("固定费用计费区间无效");
  }
  const numerator = BigInt(saved.monthlyAmountMinor) * BigInt(coveredDays);
  return {
    ...line,
    amountMinor:
      saved.calculationMode === "full_month" || saved.calculationMode === "manual_amount"
        ? line.amountMinor
        : Number((numerator * 2n + BigInt(referenceDays)) / (BigInt(referenceDays) * 2n)),
    periodEnd: effectiveEndDate,
    coveredDays,
    referenceDays,
  };
}

function assertTargetContract(source: RentalFinanceSnapshot, contractId: string): void {
  if (contractId !== source.context.contractId) throw new RangeError("结算合同与来源范围不一致");
}

function activeMonthlyBills(source: RentalFinanceSnapshot): Map<string, RentalBillDetail> {
  const result = new Map<string, RentalBillDetail>();
  for (const bill of source.bills) {
    if (bill.type !== "monthly" || bill.status !== "active" || bill.modelVersion !== 2) continue;
    if (!bill.billingMonth) throw new RangeError("月度账单缺少稳定账期");
    if (result.has(bill.billingMonth)) throw new RangeError("合同存在重复有效月度账单");
    result.set(bill.billingMonth, bill);
  }
  return result;
}

function isMeterSnapshot(
  snapshot: RentalFeeSnapshot | undefined,
): snapshot is Extract<RentalFeeSnapshot, { kind: RentalMeterKind }> {
  return snapshot?.kind === "water" || snapshot?.kind === "electricity";
}

function terminalReading(
  source: RentalFinanceSnapshot,
  requested: { kind: RentalMeterKind; readingDate: string; reading: string },
  effectiveEndDate: string,
): RentalMeterReading {
  parseCalendarDate(requested.readingDate);
  if (requested.readingDate > effectiveEndDate)
    throw new RangeError("末次抄表日期不能晚于有效结束日");
  const space = source.contract.spaces.length === 1 ? source.contract.spaces[0] : null;
  if (!space) throw new RangeError("结算读数需要唯一合同空间");
  const matches = source.readings.filter(
    (item) =>
      item.kind === requested.kind &&
      item.readingDate === requested.readingDate &&
      parseDecimal4(item.reading) === parseDecimal4(requested.reading) &&
      item.contractId === source.context.contractId &&
      item.spaceId === space.spaceId,
  );
  if (matches.length !== 1) throw new RangeError("末次读数没有唯一匹配的内部读数记录");
  assertSettlementReadingMonotonicity(source, requested, space.spaceId);
  return matches[0] as RentalMeterReading;
}

function clipCrossingMeterLine(
  line: RentalBillLine,
  source: RentalFinanceSnapshot,
  requested: { kind: RentalMeterKind; readingDate: string; reading: string }[],
  effectiveEndDate: string,
): RentalBillLine | null {
  const saved = line.feeSnapshot;
  if (!isMeterSnapshot(saved) || saved.endDate <= effectiveEndDate) return null;
  const requestedBoundary = requested.find(
    (item) =>
      item.kind === saved.kind &&
      item.readingDate > saved.startDate &&
      item.readingDate < saved.endDate,
  );
  if (!requestedBoundary) return null;
  const terminal = terminalReading(source, requestedBoundary, effectiveEndDate);
  if (terminal.predecessorId !== saved.startReadingId) {
    throw new RangeError("最终读数必须直接延续已计费水电区间的起点");
  }
  return {
    ...line,
    amountMinor: calculateMeterCharge(saved.startReading, terminal.reading, saved.unitPrice),
    periodEnd: terminal.readingDate,
    feeSnapshot: {
      ...saved,
      endReadingId: terminal.id,
      endDate: terminal.readingDate,
      endReading: terminal.reading,
    },
  };
}

function moveFutureMeterLinesToEndingMonth(
  futureBills: RentalBillDetail[],
  requested: { kind: RentalMeterKind; readingDate: string; reading: string }[],
  source: RentalFinanceSnapshot,
  effectiveEndDate: string,
  bills: Map<string, PlannedBill>,
): void {
  const endingMonth = effectiveEndDate.slice(0, 7);
  const target = bills.get(endingMonth) ?? {
    billId: null,
    billingMonth: endingMonth,
    lines: [],
  };
  const intervals = new Set(
    [...bills.values()].flatMap((bill) =>
      bill.lines.flatMap((line) => {
        const snapshot = line.feeSnapshot;
        return isMeterSnapshot(snapshot)
          ? [`${snapshot.kind}:${snapshot.startReadingId}:${snapshot.endReadingId}`]
          : [];
      }),
    ),
  );

  for (const bill of futureBills) {
    for (const line of bill.lines) {
      const snapshot = line.feeSnapshot;
      if (!isMeterSnapshot(snapshot) || snapshot.startDate > effectiveEndDate) continue;
      const moved =
        snapshot.endDate > effectiveEndDate
          ? clipCrossingMeterLine(line, source, requested, effectiveEndDate)
          : line;
      if (!moved) continue;
      const movedSnapshot = moved.feeSnapshot;
      if (!isMeterSnapshot(movedSnapshot)) throw new RangeError("结算水电快照不完整");
      const key = `${movedSnapshot.kind}:${movedSnapshot.startReadingId}:${movedSnapshot.endReadingId}`;
      if (intervals.has(key)) throw new RangeError("结算计划包含重复水电计费区间");
      target.lines.push(moved);
      intervals.add(key);
    }
  }
  if (target.lines.length > 0) bills.set(endingMonth, target);
}

function addTerminalMeterLines(
  source: RentalFinanceSnapshot,
  requested: { kind: RentalMeterKind; readingDate: string; reading: string }[],
  effectiveEndDate: string,
  bills: Map<string, PlannedBill>,
): void {
  const existingIntervals = new Set<string>();
  const billedEnds = new Map<RentalMeterKind, Array<{ date: string; id: string }>>();
  for (const bill of source.bills) {
    if (bill.type !== "monthly" || bill.status !== "active" || bill.modelVersion !== 2) continue;
    for (const line of bill.lines) {
      const saved = line.feeSnapshot;
      if (!isMeterSnapshot(saved)) continue;
      existingIntervals.add(`${saved.kind}:${saved.startReadingId}:${saved.endReadingId}`);
      if (saved.endDate <= effectiveEndDate) {
        billedEnds.set(saved.kind, [
          ...(billedEnds.get(saved.kind) ?? []),
          { date: saved.endDate, id: saved.endReadingId },
        ]);
      }
    }
  }
  for (const bill of bills.values()) {
    for (const line of bill.lines) {
      const saved = line.feeSnapshot;
      if (!isMeterSnapshot(saved)) continue;
      existingIntervals.add(`${saved.kind}:${saved.startReadingId}:${saved.endReadingId}`);
      if (saved.endDate <= effectiveEndDate) {
        billedEnds.set(saved.kind, [
          ...(billedEnds.get(saved.kind) ?? []),
          { date: saved.endDate, id: saved.endReadingId },
        ]);
      }
    }
  }
  const requestedKinds = new Set<RentalMeterKind>();
  for (const value of requested) {
    if (requestedKinds.has(value.kind)) throw new RangeError("结算读数类型不能重复");
    requestedKinds.add(value.kind);
    const end = terminalReading(source, value, effectiveEndDate);
    if (
      source.bills.some(
        (bill) =>
          bill.type === "monthly" &&
          bill.status === "active" &&
          bill.modelVersion === 2 &&
          bill.lines.some((line) => {
            const saved = line.feeSnapshot;
            return (
              isMeterSnapshot(saved) && saved.kind === value.kind && saved.endReadingId === end.id
            );
          }),
      )
    )
      continue;
    if (
      [...bills.values()].some((bill) =>
        bill.lines.some((line) => {
          const saved = line.feeSnapshot;
          return (
            isMeterSnapshot(saved) && saved.kind === value.kind && saved.endReadingId === end.id
          );
        }),
      )
    )
      continue;

    const lastBillEnd = (billedEnds.get(value.kind) ?? [])
      .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
      .at(-1);
    const baselines = source.readings.filter(
      (item) =>
        item.kind === value.kind &&
        item.predecessorId === null &&
        item.contractId === source.context.contractId,
    );
    const start = lastBillEnd
      ? source.readings.find((item) => item.id === lastBillEnd.id)
      : baselines.length === 1
        ? baselines[0]
        : undefined;
    if (!start || end.predecessorId !== start.id) {
      throw new RangeError("末次读数必须以前一已计费边界为前驱");
    }
    if (
      start.readingDate >= end.readingDate ||
      parseDecimal4(start.reading) > parseDecimal4(end.reading)
    ) {
      throw new RangeError("末次水电区间日期或读数顺序无效");
    }
    const intervalKey = `${value.kind}:${start.id}:${end.id}`;
    if (existingIntervals.has(intervalKey)) continue;
    if (!source.terms) throw new RangeError("结算水电收费标准缺失");
    const unitPrice =
      value.kind === "water" ? source.terms.waterUnitPrice : source.terms.electricityUnitPrice;
    const lines = bills.get(value.readingDate.slice(0, 7)) ?? {
      billId: null,
      billingMonth: value.readingDate.slice(0, 7),
      lines: [],
    };
    lines.lines.push(
      addLine({
        kind: value.kind,
        label: value.kind === "water" ? "水费" : "电费",
        amountMinor: calculateMeterCharge(start.reading, end.reading, unitPrice),
        periodStart: start.readingDate,
        periodEnd: end.readingDate,
        feeSnapshot: {
          kind: value.kind,
          startReadingId: start.id,
          endReadingId: end.id,
          startDate: start.readingDate,
          endDate: end.readingDate,
          startReading: start.reading,
          endReading: end.reading,
          unitPrice,
          overrideReason: null,
        },
      }),
    );
    bills.set(lines.billingMonth, lines);
    existingIntervals.add(intervalKey);
  }
}

function validCashDifference(source: RentalFinanceSnapshot, finalCostMinor: number): number {
  let received = 0n;
  let refunded = 0n;
  for (const entry of source.cashEntries) {
    if (entry.revokedAt !== null) continue;
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      throw new RangeError("有效收退款必须为正安全整数");
    }
    if (entry.kind === "receipt") received += BigInt(entry.amountMinor);
    else refunded += BigInt(entry.amountMinor);
  }
  const difference = BigInt(finalCostMinor) - (received - refunded);
  if (difference > maximum || difference < -maximum)
    throw new RangeError("结算差额超出安全整数范围");
  return Number(difference);
}

/** 从原付款账期、账单快照和全部有效资金重建合同截至结束日的结算。 */
export function buildRentalSettlementPlan(
  source: RentalFinanceSnapshot,
  input: import("@xpense/shared").PreviewRentalSettlementRequest,
): SettlementPlan {
  assertTargetContract(source, input.contractId);
  if (source.contract.lifecycleStatus === "cancelled") {
    if (!source.cancelledOn) throw new RangeError("取消结算缺少已保存取消日期");
    parseCalendarDate(source.cancelledOn);
    const endMonth = source.cancelledOn.slice(0, 7);
    return {
      effectiveEndDate: source.cancelledOn,
      withdrawnBillIds: [...activeMonthlyBills(source)]
        .filter(([billingMonth]) => billingMonth > endMonth)
        .map(([, bill]) => bill.id)
        .sort(),
      finalBills: [],
      finalCostMinor: 0,
      differenceMinor: validCashDifference(source, 0),
    };
  }

  const terms = billingTerms(source);
  const effectiveEndDate = source.contract.terminationDate ?? source.contract.endDate;
  if (!effectiveEndDate) throw new RangeError("合同缺少实际结束日期");
  parseCalendarDate(effectiveEndDate);
  if (effectiveEndDate < terms.startDate || effectiveEndDate > terms.endDate) {
    throw new RangeError("结算结束日必须位于合同租期内");
  }

  const activeBills = activeMonthlyBills(source);
  const workByMonth = new Map<string, PlannedBill>();
  const firstMonth = terms.startDate.slice(0, 7);
  const lastMonth = effectiveEndDate.slice(0, 7);
  const futureBills = [...activeBills]
    .filter(([billingMonth]) => billingMonth > lastMonth)
    .map(([, bill]) => bill);
  const withdrawnBillIds = futureBills.map(({ id }) => id).sort();
  for (const [billingMonth, bill] of activeBills) {
    if (billingMonth < firstMonth || billingMonth > lastMonth) continue;
    const lines: RentalBillLine[] = [];
    for (const item of bill.lines) {
      if (item.kind === "deposit") continue;
      const saved = item.feeSnapshot;
      if (item.kind === "extra_fee" && saved?.kind === "extra_fee" && saved.origin === "settlement")
        continue;
      if (item.kind === "rent_period" && item.periodStart && item.periodStart > effectiveEndDate)
        continue;
      if (item.kind === "fixed_fee") {
        const clipped = clipFixedFee(item, effectiveEndDate);
        if (clipped) lines.push(clipped);
        continue;
      }
      if (isMeterSnapshot(saved) && saved.endDate > effectiveEndDate) {
        const clipped = clipCrossingMeterLine(
          item,
          source,
          input.finalReadings ?? [],
          effectiveEndDate,
        );
        if (clipped) lines.push(clipped);
        continue;
      }
      lines.push(item);
    }
    workByMonth.set(billingMonth, { billId: bill.id, billingMonth, lines });
  }

  moveFutureMeterLinesToEndingMonth(
    futureBills,
    input.finalReadings ?? [],
    source,
    effectiveEndDate,
    workByMonth,
  );

  for (const { billingMonth, lines: rentLines } of projectRentalRentThroughDate(
    terms,
    effectiveEndDate,
  )) {
    const bill = workByMonth.get(billingMonth) ?? { billId: null, billingMonth, lines: [] };
    for (const rentLine of rentLines) {
      const existingIndex = bill.lines.findIndex(
        (item) => item.kind === "rent_period" && item.periodStart === rentLine.periodStart,
      );
      if (existingIndex < 0) bill.lines.push(rentLine);
      else bill.lines[existingIndex] = rentLine;
    }
    workByMonth.set(billingMonth, bill);
  }

  for (const billingMonth of monthRange(terms.startDate, effectiveEndDate)) {
    if (activeBills.has(billingMonth)) continue;
    const fixed = fixedFeeLines(source, billingMonth, effectiveEndDate);
    if (fixed.length === 0) continue;
    const bill = workByMonth.get(billingMonth) ?? { billId: null, billingMonth, lines: [] };
    bill.lines.push(...fixed);
    workByMonth.set(billingMonth, bill);
  }

  addTerminalMeterLines(source, input.finalReadings ?? [], effectiveEndDate, workByMonth);
  const finalMonth = effectiveEndDate.slice(0, 7);
  if (input.extraFees.length > 0) {
    const bill = workByMonth.get(finalMonth) ?? {
      billId: null,
      billingMonth: finalMonth,
      lines: [],
    };
    const retainedMonthlyFeeIds = new Set(
      bill.lines.flatMap((line) =>
        line.feeSnapshot?.kind === "extra_fee" && line.feeSnapshot.origin === "monthly"
          ? [line.feeSnapshot.extraFeeId]
          : [],
      ),
    );
    const settlementFeeIds = new Set<string>();
    for (const fee of input.extraFees) {
      if (settlementFeeIds.has(fee.id)) throw new RangeError("结算额外费用ID不能重复");
      if (retainedMonthlyFeeIds.has(fee.id))
        throw new RangeError("结算额外费用ID与保留月度额外费用冲突");
      settlementFeeIds.add(fee.id);
      if (!Number.isSafeInteger(fee.amountMinor))
        throw new RangeError("结算额外费用必须是安全整数");
      bill.lines.push(
        addLine({
          kind: "extra_fee",
          label: fee.name,
          amountMinor: fee.amountMinor,
          note: fee.note,
          feeSnapshot: { kind: "extra_fee", extraFeeId: fee.id, origin: "settlement" },
        }),
      );
    }
    workByMonth.set(finalMonth, bill);
  }

  const finalBills = [...workByMonth.values()]
    .sort((left, right) => left.billingMonth.localeCompare(right.billingMonth))
    .map((bill) => {
      const lines = bill.lines.map((item, sortOrder) => ({ ...item, sortOrder }));
      return {
        billId: bill.billId,
        billingMonth: bill.billingMonth,
        lines,
        amountMinor: checkedAmount(lines),
      };
    });
  const cost = finalBills.reduce((total, bill) => total + BigInt(bill.amountMinor), 0n);
  if (cost > maximum) throw new RangeError("合同最终费用超出安全整数范围");
  const finalCostMinor = Number(cost);
  return {
    effectiveEndDate,
    withdrawnBillIds,
    finalBills,
    finalCostMinor,
    differenceMinor: validCashDifference(source, finalCostMinor),
  };
}
