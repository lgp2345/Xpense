import type { RentalBillLine, RentalFeeSnapshot, RentalFixedFeeAdjustment } from "@xpense/shared";
import { parseCalendarDate } from "./contract-date.rules.js";
import { calculateMeterCharge, parseDecimal4 } from "./rental-decimal.rules.js";
import type {
  BillRevisionPlan,
  RentalFinanceSnapshot,
  RentalMeterReading,
} from "./rental-finance.types.js";

const maximum = BigInt(Number.MAX_SAFE_INTEGER);

function assertSafeTotal(lines: RentalBillLine[]): number {
  const amount = lines.reduce((total, item) => total + BigInt(item.amountMinor), 0n);
  if (amount < 0n) throw new RangeError("综合账单应收金额不能为负数");
  if (amount > maximum) throw new RangeError("综合账单金额超出安全整数范围");
  return Number(amount);
}

function feeSnapshot(line: RentalBillLine): RentalFeeSnapshot | null {
  return line.feeSnapshot ?? null;
}

function resolveReading(
  source: RentalFinanceSnapshot,
  billId: string,
  input: { kind: RentalMeterReading["kind"]; readingDate: string },
): RentalMeterReading {
  const bill = source.bills.find((item) => item.id === billId);
  if (!bill) throw new RangeError("找不到待更正账单");
  const endpointIds = bill.lines.flatMap((item) => {
    const snapshot = feeSnapshot(item);
    return snapshot?.kind === input.kind ? [snapshot.startReadingId, snapshot.endReadingId] : [];
  });
  const found = source.readings.filter(
    (item) =>
      item.kind === input.kind &&
      item.readingDate === input.readingDate &&
      endpointIds.includes(item.id),
  );
  if (found.length === 1) return found[0] as RentalMeterReading;
  if (found.length > 1) throw new RangeError("读数日期对应多个计费边界");

  const endIds = bill.lines.flatMap((item) => {
    const snapshot = feeSnapshot(item);
    return snapshot?.kind === input.kind ? [snapshot.endReadingId] : [];
  });
  const endReadings = source.readings.filter(
    (item) => item.kind === input.kind && endIds.includes(item.id),
  );
  if (endReadings.length !== 1) throw new RangeError("新抄表日期无法定位到唯一账单边界");
  return endReadings[0] as RentalMeterReading;
}

function assertAdjacentReadings(readings: RentalMeterReading[], updated: RentalMeterReading): void {
  parseCalendarDate(updated.readingDate);
  const value = parseDecimal4(updated.reading);
  const byId = new Map(readings.map((item) => [item.id, item]));
  if (updated.predecessorId !== null) {
    const previous = byId.get(updated.predecessorId);
    if (
      !previous ||
      previous.kind !== updated.kind ||
      previous.contractId !== updated.contractId ||
      previous.spaceId !== updated.spaceId ||
      previous.readingDate >= updated.readingDate ||
      parseDecimal4(previous.reading) > value
    ) {
      throw new RangeError("更正后读数不能早于前次读数或日期");
    }
  }
  for (const next of readings.filter((item) => item.predecessorId === updated.id)) {
    if (
      next.kind !== updated.kind ||
      next.readingDate <= updated.readingDate ||
      parseDecimal4(next.reading) < value
    ) {
      throw new RangeError("更正后读数不能晚于后续读数或日期");
    }
  }
}

function reviseMeterLine(
  line: RentalBillLine,
  readingById: Map<string, RentalMeterReading>,
  unitPrice?: string,
  reason?: string,
): RentalBillLine {
  const saved = feeSnapshot(line);
  if (!saved || (saved.kind !== "water" && saved.kind !== "electricity")) return line;
  const start = readingById.get(saved.startReadingId);
  const end = readingById.get(saved.endReadingId);
  if (!start || !end || end.predecessorId !== start.id) {
    throw new RangeError("计费区间读数快照不完整");
  }
  if (start.readingDate >= end.readingDate) throw new RangeError("更正后计费区间日期顺序无效");
  const price = unitPrice ?? saved.unitPrice;
  const changedPrice = unitPrice !== undefined;
  return {
    ...line,
    amountMinor: calculateMeterCharge(start.reading, end.reading, price),
    periodStart: start.readingDate,
    periodEnd: end.readingDate,
    feeSnapshot: {
      ...saved,
      startDate: start.readingDate,
      endDate: end.readingDate,
      startReading: start.reading,
      endReading: end.reading,
      unitPrice: price,
      overrideReason: changedPrice ? (reason ?? null) : saved.overrideReason,
    },
  };
}

function reviseFixedLine(
  line: RentalBillLine,
  overrides: Map<string, number>,
  reason: string,
): RentalBillLine {
  const saved = feeSnapshot(line);
  if (saved?.kind !== "fixed_fee" || !overrides.has(saved.feeId)) return line;
  const monthlyAmountMinor = overrides.get(saved.feeId) as number;
  if (!Number.isSafeInteger(monthlyAmountMinor) || monthlyAmountMinor < 0) {
    throw new RangeError("固定月费必须是非负安全整数");
  }
  if (saved.calculationMode === "full_month")
    return {
      ...line,
      amountMinor: monthlyAmountMinor,
      feeSnapshot: { ...saved, monthlyAmountMinor, overrideReason: reason },
    };
  const coveredDays = BigInt(line.coveredDays ?? 0);
  const referenceDays = BigInt(line.referenceDays ?? 0);
  if (coveredDays <= 0n || referenceDays <= 0n || coveredDays > referenceDays) {
    throw new RangeError("固定月费计费天数快照无效");
  }
  const numerator = BigInt(monthlyAmountMinor) * coveredDays;
  return {
    ...line,
    amountMinor: Number((numerator * 2n + referenceDays) / (referenceDays * 2n)),
    feeSnapshot: { ...saved, monthlyAmountMinor, overrideReason: reason },
  };
}

function extraFeeLines(
  extraFees: NonNullable<import("@xpense/shared").RentalBillRevisionInput["extraFees"]>,
  existing: RentalBillLine[],
): RentalBillLine[] {
  const origins = new Map(
    existing.flatMap((item) => {
      const saved = feeSnapshot(item);
      return saved?.kind === "extra_fee" ? [[saved.extraFeeId, saved.origin] as const] : [];
    }),
  );
  return extraFees.map((fee) => {
    if (!Number.isSafeInteger(fee.amountMinor)) throw new RangeError("额外费用必须是安全整数");
    return {
      kind: "extra_fee",
      label: fee.name,
      amountMinor: fee.amountMinor,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 0,
      note: fee.note,
      feeSnapshot: {
        kind: "extra_fee",
        extraFeeId: fee.id,
        origin: origins.get(fee.id) ?? "monthly",
      },
    };
  });
}

function fixedAdjustments(
  lines: RentalBillLine[],
  adjustments: RentalFixedFeeAdjustment[],
  overrides: Map<string, number>,
): Map<string, RentalFixedFeeAdjustment> {
  const ids = new Set(
    lines.flatMap((line) =>
      line.feeSnapshot?.kind === "fixed_fee" ? [line.feeSnapshot.feeId] : [],
    ),
  );
  const result = new Map<string, RentalFixedFeeAdjustment>();
  for (const value of adjustments) {
    if (!ids.has(value.feeId)) throw new RangeError("固定费用事项不属于本张账单");
    if (result.has(value.feeId)) throw new RangeError("同一固定费用事项不能重复调整");
    if (overrides.has(value.feeId))
      throw new RangeError("同一固定费用事项不能同时覆盖月标准和本期金额");
    if (
      value.action === "set_amount" &&
      (!Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0)
    )
      throw new RangeError("本期固定费用必须是非负安全整数");
    result.set(value.feeId, value);
  }
  return result;
}

/** 依赖账单保存的单价快照，更正共享读数时同步重算相邻计费区间。 */
export function buildMeterCorrectionPlan(
  source: RentalFinanceSnapshot,
  input: import("@xpense/shared").RentalBillRevisionInput,
): BillRevisionPlan {
  const target = source.bills.find((item) => item.id === input.billId);
  if (target?.type !== "monthly" || target.status !== "active") {
    throw new RangeError("待更正资源不是有效月度账单");
  }
  if (input.mode === "edit_unpaid" && input.readings?.length)
    throw new RangeError("编辑本期费用不能更正共享读数，请使用读数更正");

  const updatedReadings = new Map<string, RentalMeterReading>();
  for (const value of input.readings ?? []) {
    if (
      updatedReadings.size > 0 &&
      [...updatedReadings.values()].some((item) => item.kind === value.kind)
    ) {
      throw new RangeError("每种表计只能更正一个边界");
    }
    const saved = resolveReading(source, target.id, value);
    const updated = { ...saved, readingDate: value.readingDate, reading: value.reading };
    updatedReadings.set(saved.id, updated);
  }
  const readingById = new Map(
    source.readings.map((item) => [item.id, updatedReadings.get(item.id) ?? item]),
  );
  for (const updated of updatedReadings.values()) {
    assertAdjacentReadings([...readingById.values()], updated);
  }

  const affected = source.bills
    .filter(
      (bill) =>
        bill.id === target.id ||
        bill.lines.some((item) => {
          const saved = feeSnapshot(item);
          return (
            saved !== null &&
            (saved.kind === "water" || saved.kind === "electricity") &&
            (updatedReadings.has(saved.startReadingId) || updatedReadings.has(saved.endReadingId))
          );
        }),
    )
    .sort(
      (left, right) =>
        (left.billingMonth ?? "").localeCompare(right.billingMonth ?? "") ||
        left.id.localeCompare(right.id),
    );
  const priceOverrides = new Map<string, string>();
  if (input.overrides?.waterUnitPrice !== undefined)
    priceOverrides.set("water", input.overrides.waterUnitPrice);
  if (input.overrides?.electricityUnitPrice !== undefined)
    priceOverrides.set("electricity", input.overrides.electricityUnitPrice);
  const fixedOverrides = new Map(
    (input.overrides?.fixedFees ?? []).map((item) => [item.id, item.monthlyAmountMinor]),
  );
  const adjustments = fixedAdjustments(
    target.lines,
    input.fixedFeeAdjustments ?? [],
    fixedOverrides,
  );

  const bills = affected.map((bill) => {
    const revised = bill.lines
      .flatMap((item) => {
        if (bill.id === target.id && item.kind === "extra_fee" && input.extraFees !== undefined) {
          return [];
        }
        const saved = feeSnapshot(item);
        if (
          bill.id === target.id &&
          saved?.kind === "fixed_fee" &&
          adjustments.get(saved.feeId)?.action === "remove"
        )
          return [];
        return [item];
      })
      .map((item) => {
        const saved = feeSnapshot(item);
        const unitPrice =
          bill.id === target.id && (saved?.kind === "water" || saved?.kind === "electricity")
            ? priceOverrides.get(saved.kind)
            : undefined;
        if (saved?.kind === "water" || saved?.kind === "electricity") {
          return unitPrice !== undefined ||
            updatedReadings.has(saved.startReadingId) ||
            updatedReadings.has(saved.endReadingId)
            ? reviseMeterLine(item, readingById, unitPrice, input.overrides?.reason)
            : item;
        }
        const adjustment =
          bill.id === target.id && saved?.kind === "fixed_fee"
            ? adjustments.get(saved.feeId)
            : undefined;
        if (saved?.kind === "fixed_fee" && adjustment?.action === "set_amount")
          return {
            ...item,
            amountMinor: adjustment.amountMinor,
            feeSnapshot: {
              ...saved,
              calculationMode: "manual_amount" as const,
              overrideReason: input.reason,
            },
          };
        return bill.id === target.id && item.kind === "fixed_fee"
          ? reviseFixedLine(item, fixedOverrides, input.overrides?.reason ?? "")
          : item;
      });
    if (bill.id === target.id && input.extraFees !== undefined) {
      const nextOrder = Math.max(-1, ...revised.map((line) => line.sortOrder)) + 1;
      revised.push(
        ...extraFeeLines(input.extraFees, bill.lines).map((line, index) => ({
          ...line,
          sortOrder: nextOrder + index,
        })),
      );
    }
    const lines = revised;
    return { billId: bill.id, lines, amountMinor: assertSafeTotal(lines) };
  });

  return {
    bills,
    readings: [...updatedReadings.values()],
    affectedBillIds: bills.map((bill) => bill.billId),
  };
}
