import { randomUUID } from "node:crypto";
import type {
  PreviewRentalMonthlyBillRequest,
  RentalBillDetail,
  RentalBillLine,
  RentalChargeTerms,
  RentalMeterReadingInput,
} from "@xpense/shared";

import type { BillingSource, BillingTerms } from "./billing.types.js";
import { compareCalendarDates, daysInMonth, parseCalendarDate } from "./contract-date.rules.js";
import { calculateMonthlyCharges } from "./monthly-charge.rules.js";
import { parseDecimal4 } from "./rental-decimal.rules.js";
import type {
  MonthlyChargeResult,
  RentalFinanceSnapshot,
  RentalMeterReading,
} from "./rental-finance.types.js";
import { financeSourceVersion } from "./rental-finance-request.rules.js";

export const monthlyMeterKinds = ["water", "electricity"] as const;
type MeterKind = (typeof monthlyMeterKinds)[number];

export type PreparedInterval = {
  previous: RentalMeterReading;
  current: RentalMeterReading;
  input: RentalMeterReadingInput;
  pending: boolean;
};

export type PreviewPlan = {
  version: string;
  defaults: RentalChargeTerms;
  baselineReadings: RentalMeterReadingInput[];
  intervals: Record<MeterKind, PreparedInterval | null>;
  missingFields: string[];
  lines: RentalBillLine[];
  amountMinor: number;
  existingBill: RentalBillDetail | undefined;
  dueDate: string | undefined;
};

export class MonthlyBillPlanError extends Error {
  constructor(
    readonly kind: "bad_request" | "conflict",
    message: string,
  ) {
    super(message);
  }
}

function badRequest(message: string): never {
  throw new MonthlyBillPlanError("bad_request", message);
}

function conflict(message: string): never {
  throw new MonthlyBillPlanError("conflict", message);
}

export function defaultRentalChargeTerms(snapshot: RentalFinanceSnapshot): RentalChargeTerms {
  return (
    snapshot.terms ?? {
      contractId: snapshot.context.contractId,
      version: "0",
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
      waterUnitPrice: "0.0000",
      electricityUnitPrice: "0.0000",
      fixedFees: [],
    }
  );
}

function billingTerms(snapshot: RentalFinanceSnapshot): BillingTerms {
  const contract = snapshot.contract;
  if (
    (contract.lifecycleStatus !== "confirmed" && contract.lifecycleStatus !== "terminated") ||
    !contract.startDate ||
    !contract.endDate ||
    contract.rentAmountMinor === null ||
    contract.billingAnchor === null ||
    contract.paymentIntervalMonths === null ||
    contract.dueDaysBefore === null
  ) {
    throw new RangeError("合同缺少可用于月度出账的已确认计费信息");
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

function baselines(snapshot: RentalFinanceSnapshot): RentalMeterReadingInput[] {
  return snapshot.readings
    .filter((reading) => reading.predecessorId === null)
    .map(({ kind, readingDate, reading }) => ({ kind, readingDate, reading }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

export function sourceForMonthlyBills(snapshot: RentalFinanceSnapshot): BillingSource {
  return {
    organizationId: snapshot.context.organizationId,
    currencyCode: snapshot.context.currencyCode,
    timezone: snapshot.context.timezone,
    today: snapshot.context.today,
    contract: snapshot.contract,
    terminationRecordedAt: null,
    activeBills: snapshot.bills.filter(({ status }) => status === "active"),
    adjustment: null,
  };
}

function latestBefore(
  snapshot: RentalFinanceSnapshot,
  kind: MeterKind,
  readingDate: string,
  spaceId: string,
): RentalMeterReading | undefined {
  return snapshot.readings
    .filter(
      (reading) =>
        reading.kind === kind &&
        reading.spaceId === spaceId &&
        compareCalendarDates(reading.readingDate, readingDate) < 0,
    )
    .toSorted((a, b) =>
      a.readingDate === b.readingDate
        ? a.id.localeCompare(b.id)
        : a.readingDate.localeCompare(b.readingDate),
    )
    .at(-1);
}

function hasUsedInterval(
  snapshot: RentalFinanceSnapshot,
  kind: MeterKind,
  startId: string,
  endId: string,
): boolean {
  return snapshot.bills.some((bill) =>
    bill.lines.some((line) => {
      const fee = line.feeSnapshot;
      return fee?.kind === kind && fee.startReadingId === startId && fee.endReadingId === endId;
    }),
  );
}

export function monthlyBillLinePeriod(
  lines: RentalBillLine[],
  side: "start" | "end",
  fallback: string,
): string {
  const values = lines
    .map((line) => (side === "start" ? line.periodStart : line.periodEnd))
    .filter((value): value is string => value !== null)
    .toSorted();
  return side === "start" ? (values[0] ?? fallback) : (values.at(-1) ?? fallback);
}

export function buildMonthlyBillPlan(
  snapshot: RentalFinanceSnapshot,
  dto: PreviewRentalMonthlyBillRequest,
): PreviewPlan {
  if (snapshot.contract.billingMode !== "monthly_settlement") conflict("存量合同仍使用旧账单模式");
  if (
    snapshot.contract.lifecycleStatus !== "confirmed" &&
    snapshot.contract.lifecycleStatus !== "terminated"
  )
    conflict("草稿、取消合同不能生成月度账单");
  if (snapshot.cancelledOn) conflict("已取消合同不能生成月度账单");

  const terms = billingTerms(snapshot);
  const effectiveEnd = snapshot.contract.terminationDate ?? snapshot.contract.endDate;
  if (!effectiveEnd) badRequest("合同缺少结束日期");
  parseCalendarDate(`${dto.billingMonth}-01`);
  if (dto.dueDate) parseCalendarDate(dto.dueDate);
  const monthStart = `${dto.billingMonth}-01`;
  const monthEnd = `${dto.billingMonth}-${String(
    daysInMonth(parseCalendarDate(monthStart).year, parseCalendarDate(monthStart).month),
  ).padStart(2, "0")}`;
  if (monthEnd < terms.startDate || monthStart > effectiveEnd)
    badRequest("出账月份不在合同实际租期内");

  const existingBill = snapshot.bills.find(
    (bill) =>
      bill.type === "monthly" &&
      bill.modelVersion === 2 &&
      bill.billingMonth === dto.billingMonth &&
      bill.status === "active",
  );
  const spaceIds = snapshot.contract.spaces.map(({ spaceId }) => spaceId);
  if (spaceIds.length !== 1) conflict("月度结算合同必须且只能关联一个空间");
  const spaceId = spaceIds[0];
  if (!spaceId) conflict("合同缺少唯一结算空间");
  const inputs = new Map((dto.readings ?? []).map((reading) => [reading.kind, reading]));
  const intervals: Record<MeterKind, PreparedInterval | null> = {
    water: null,
    electricity: null,
  };
  const missingFields: string[] = [];
  if (!dto.dueDate) missingFields.push("dueDate");
  for (const kind of monthlyMeterKinds) {
    const input = inputs.get(kind);
    if (!input) {
      missingFields.push(`${kind}Reading`);
      continue;
    }
    parseCalendarDate(input.readingDate);
    parseDecimal4(input.reading);
    if (input.readingDate > effectiveEnd) badRequest("抄表日期不能晚于合同实际结束日期");
    const sameDate = snapshot.readings.filter(
      (reading) =>
        reading.kind === kind &&
        reading.spaceId === spaceId &&
        reading.readingDate === input.readingDate,
    );
    if (sameDate.length > 1) conflict("同一表计日期存在多条读数，无法安全出账");
    const existing = sameDate[0];
    if (existing && parseDecimal4(existing.reading) !== parseDecimal4(input.reading))
      conflict("同一表计日期的读数变化需通过更正处理");
    const previous = latestBefore(snapshot, kind, input.readingDate, spaceId);
    if (!previous) {
      missingFields.push(`${kind}Baseline`);
      continue;
    }
    const current = existing ?? {
      id: randomUUID(),
      contractId: snapshot.context.contractId,
      spaceId,
      kind,
      readingDate: input.readingDate,
      reading: input.reading,
      revision: 1,
      predecessorId: previous.id,
    };
    if (current.id === previous.id) conflict("本次抄表日期必须晚于当前底数");
    if (existing && existing.predecessorId !== previous.id)
      conflict("本次读数不属于当前水电表计链");
    if (!existing) {
      const chainTail = snapshot.readings
        .filter((reading) => reading.kind === kind && reading.spaceId === spaceId)
        .toSorted((a, b) =>
          a.readingDate === b.readingDate
            ? a.id.localeCompare(b.id)
            : a.readingDate.localeCompare(b.readingDate),
        )
        .at(-1);
      if (chainTail && chainTail.id !== previous.id) conflict("新抄表读数只能延续当前水电表计链尾");
    }
    if (hasUsedInterval(snapshot, kind, previous.id, current.id) && !existingBill)
      conflict("该水电计费区间已用于历史账单");
    intervals[kind] = { previous, current, input, pending: !existing };
  }

  const calculation = calculateMonthlyBillCharges(snapshot, dto, intervals);
  return {
    version: financeSourceVersion(snapshot, dto),
    defaults: defaultRentalChargeTerms(snapshot),
    baselineReadings: baselines(snapshot),
    intervals,
    missingFields,
    lines: calculation.lines,
    amountMinor: calculation.amountMinor,
    existingBill,
    dueDate: dto.dueDate,
  };
}

export function calculateMonthlyBillCharges(
  snapshot: RentalFinanceSnapshot,
  dto: PreviewRentalMonthlyBillRequest,
  intervals: Record<MeterKind, PreparedInterval | null>,
): MonthlyChargeResult {
  const terms = billingTerms(snapshot);
  const effectiveEndDate = snapshot.contract.terminationDate ?? snapshot.contract.endDate;
  if (!effectiveEndDate) throw new RangeError("合同缺少结束日期");
  return calculateMonthlyCharges({
    billingTerms: terms,
    billingMonth: dto.billingMonth,
    effectiveEndDate,
    chargeTerms: defaultRentalChargeTerms(snapshot),
    readings: intervals,
    extraFees: dto.extraFees,
    ...(dto.overrides ? { overrides: dto.overrides } : {}),
  });
}
