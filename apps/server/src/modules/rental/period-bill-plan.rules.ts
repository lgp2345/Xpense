import type {
  PreviewRentalPeriodBillRequest,
  RentalBillingStartInput,
  RentalChargeTerms,
  RentalMeterKind,
  RentalMeterReadingInput,
  RentalPeriodBillContext,
} from "@xpense/shared";
import type { BillingSource, BillingTerms } from "./billing.types.js";
import { parseCalendarDate } from "./contract-date.rules.js";
import { calculatePeriodCharges } from "./period-charge.rules.js";
import { resolvePeriodMeterBaselines } from "./period-meter.rules.js";
import { billingPeriods, selectNextBillingPeriod } from "./period-schedule.rules.js";
import { parseDecimal4 } from "./rental-decimal.rules.js";
import type { RentalFinanceSnapshot, RentalMeterReading } from "./rental-finance.types.js";
import { financeSourceVersion } from "./rental-finance-request.rules.js";

export class PeriodBillPlanError extends Error {
  constructor(
    readonly kind: "bad_request" | "conflict",
    message: string,
  ) {
    super(message);
  }
}
export function periodBillingTerms(source: RentalFinanceSnapshot): BillingTerms {
  const c = source.contract;
  if (
    !c.startDate ||
    !c.endDate ||
    c.rentAmountMinor === null ||
    c.billingAnchor === null ||
    c.paymentIntervalMonths === null ||
    c.dueDaysBefore === null
  )
    throw new RangeError("合同缺少计费信息");
  return {
    startDate: c.startDate,
    endDate: c.endDate,
    rentAmountMinor: c.rentAmountMinor,
    billingAnchor: c.billingAnchor,
    paymentIntervalMonths: c.paymentIntervalMonths,
    dueDaysBefore: c.dueDaysBefore,
  };
}
export function defaultPeriodChargeTerms(source: RentalFinanceSnapshot): RentalChargeTerms {
  return (
    source.terms ?? {
      contractId: source.context.contractId,
      version: "0",
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
      waterUnitPrice: "0",
      electricityUnitPrice: "0",
      fixedFees: [],
    }
  );
}
export function sourceForPeriodBills(source: RentalFinanceSnapshot): BillingSource {
  return {
    organizationId: source.context.organizationId,
    currencyCode: source.context.currencyCode,
    timezone: source.context.timezone,
    today: source.context.today,
    contract: source.contract,
    terminationRecordedAt: null,
    activeBills: source.bills.filter((bill) => bill.status === "active"),
    adjustment: null,
  };
}
export function assertPeriodBillingOpen(source: RentalFinanceSnapshot): void {
  if (!["confirmed", "terminated"].includes(source.contract.lifecycleStatus) || source.cancelledOn)
    throw new PeriodBillPlanError("conflict", "草稿或取消合同不能出账");
  if (source.settlement) throw new PeriodBillPlanError("conflict", "已确认结算的合同不能继续出账");
  if (source.contract.spaces.length !== 1)
    throw new PeriodBillPlanError("conflict", "账期出账必须且只能关联一个空间");
}
export function nextPeriod(source: RentalFinanceSnapshot, firstPeriodStart?: string) {
  const terms = periodBillingTerms(source);
  return selectNextBillingPeriod({
    terms,
    effectiveEndDate: source.contract.terminationDate ?? terms.endDate,
    firstPeriodStart: firstPeriodStart ?? source.billingStart?.firstPeriodStart ?? terms.startDate,
    activePeriods: source.bills
      .filter((bill) => bill.type === "period" && bill.status === "active")
      .map((bill) => ({ periodStart: bill.periodStart!, periodEnd: bill.periodEnd! })),
  });
}
export function selectableBillingPeriods(source: RentalFinanceSnapshot) {
  const terms = periodBillingTerms(source);
  return billingPeriods({
    terms,
    effectiveEndDate: source.contract.terminationDate ?? terms.endDate,
    firstPeriodStart: terms.startDate,
  }).map(({ periodStart, periodEnd }) => ({ periodStart, periodEnd }));
}
export type PeriodPreparedInterval = {
  previous: RentalMeterReading;
  current: RentalMeterReading;
  input: RentalMeterReadingInput;
};
/** 预览候选 ID 仅供计算，版本摘要始终只使用持久化来源及公共请求。 */
export function buildPeriodBillPlan(
  source: RentalFinanceSnapshot,
  dto: PreviewRentalPeriodBillRequest,
) {
  assertPeriodBillingOpen(source);
  const terms = periodBillingTerms(source);
  const defaults = defaultPeriodChargeTerms(source);
  if (source.billingStart && dto.billingStart)
    throw new PeriodBillPlanError("conflict", "出账起点已经保存，不能再次设置");
  if (
    dto.billingStart &&
    source.bills.some((bill) => bill.type === "period" && bill.status === "active")
  )
    throw new PeriodBillPlanError("conflict", "已有有效账单不能设置起点");
  const first =
    source.billingStart?.firstPeriodStart ?? dto.billingStart?.firstPeriodStart ?? terms.startDate;
  const rent = nextPeriod(source, first);
  if (!rent) throw new PeriodBillPlanError("conflict", "合同账期已全部生成");
  if (rent.periodStart !== dto.periodStart)
    throw new PeriodBillPlanError("conflict", "预览账期已变化，请重新读取下一账期");
  const missingFields: string[] = source.terms ? [] : ["chargeTerms"];
  if (first === terms.startDate && dto.billingStart?.baselineReadings.length)
    throw new RangeError("合同首期使用已登记入住底数，请通过底数接口修改");
  const billingStart: RentalBillingStartInput | null = source.billingStart
    ? null
    : { firstPeriodStart: first, baselineReadings: dto.billingStart?.baselineReadings ?? [] };
  const spaceId = source.contract.spaces[0]!.spaceId;
  const candidates = (billingStart?.baselineReadings ?? []).map((reading) => ({
    ...reading,
    id: `start:${reading.kind}`,
    contractId: source.context.contractId,
    spaceId,
    revision: 1,
    source: "billing_start" as const,
    billingStartId: "pending",
    billId: null,
    settlementId: null,
    predecessorId: null,
  }));
  for (const reading of candidates) {
    parseCalendarDate(reading.readingDate);
    parseDecimal4(reading.reading);
    if (
      reading.readingDate > source.context.today ||
      reading.readingDate > (source.contract.terminationDate ?? terms.endDate)
    )
      throw new RangeError("接续抄表日期不在有效范围内");
  }
  const baselines =
    first !== terms.startDate && !source.billingStart
      ? candidates
      : resolvePeriodMeterBaselines({ ...source, terms: defaults });
  const intervals: Record<RentalMeterKind, PeriodPreparedInterval | null> = {
    water: null,
    electricity: null,
  };
  const defaultReadings: RentalMeterReadingInput[] = [];
  for (const kind of ["water", "electricity"] as const) {
    if (!defaults[`${kind}CollectionEnabled`]) continue;
    const previous = baselines.find((reading) => reading.kind === kind);
    if (!previous) missingFields.push(`${kind}Baseline`);
    if (previous)
      defaultReadings.push({
        kind,
        readingDate:
          source.context.today < (source.contract.terminationDate ?? terms.endDate)
            ? source.context.today
            : (source.contract.terminationDate ?? terms.endDate),
        reading: previous.reading,
      });
    const input = dto.readings?.find((reading) => reading.kind === kind);
    if (!input) {
      missingFields.push(`${kind}Reading`);
      continue;
    }
    parseCalendarDate(input.readingDate);
    parseDecimal4(input.reading);
    if (
      input.readingDate > source.context.today ||
      input.readingDate > (source.contract.terminationDate ?? terms.endDate)
    )
      throw new RangeError("抄表日期不在有效范围内");
    if (!previous) continue;
    const current: RentalMeterReading = {
      ...previous,
      ...input,
      id: `bill:${kind}`,
      source: "bill",
      billId: "pending",
      billingStartId: null,
      settlementId: null,
      predecessorId: previous.id,
    };
    intervals[kind] = { previous, current, input };
  }
  const dueDate = dto.dueDate ?? rent.periodStart;
  parseCalendarDate(dueDate);
  const calculation = calculatePeriodCharges({
    rent,
    chargeTerms: defaults,
    readings: intervals,
    extraFees: dto.extraFees,
    ...(dto.overrides ? { overrides: dto.overrides } : {}),
  });
  return {
    version: financeSourceVersion(source, { ...dto, dueDate }),
    period: { periodStart: rent.periodStart, periodEnd: rent.periodEnd },
    rent,
    defaults,
    baselineReadings: baselines.map(({ kind, readingDate, reading }) => ({
      kind,
      readingDate,
      reading,
    })),
    defaultReadings,
    intervals,
    missingFields,
    dueDate,
    billingStart,
    ...calculation,
  };
}
export type PeriodBillPlan = ReturnType<typeof buildPeriodBillPlan>;

/** 只读表单上下文：候选期分页与下一期判定独立，日期和基准均由服务端提供。 */
export function buildPeriodBillContext(
  source: RentalFinanceSnapshot,
  input: { page: number; pageSize: number },
): RentalPeriodBillContext {
  assertPeriodBillingOpen(source);
  const period = nextPeriod(source);
  const all = selectableBillingPeriods(source);
  const defaults = defaultPeriodChargeTerms(source);
  const baselines = resolvePeriodMeterBaselines({ ...source, terms: defaults });
  const end = source.contract.terminationDate ?? source.contract.endDate!;
  const canSelectBillingStart =
    source.billingStart === null &&
    !source.bills.some((bill) => bill.type === "period" && bill.status === "active");
  return {
    version: financeSourceVersion(source, {}),
    billingStart: source.billingStart
      ? {
          firstPeriodStart: source.billingStart.firstPeriodStart,
          baselineReadings: source.billingStart.baselineReadings.map(
            ({ kind, readingDate, reading }) => ({ kind, readingDate, reading }),
          ),
        }
      : null,
    canSelectBillingStart,
    nextPeriod: period ? { periodStart: period.periodStart, periodEnd: period.periodEnd } : null,
    defaultDueDate: period?.periodStart ?? null,
    defaults,
    baselineReadings: baselines.map(({ kind, readingDate, reading }) => ({
      kind,
      readingDate,
      reading,
    })),
    defaultReadings: baselines.map(({ kind, reading }) => ({
      kind,
      readingDate: source.context.today < end ? source.context.today : end,
      reading,
    })),
    selectablePeriods: {
      items: canSelectBillingStart
        ? all.slice((input.page - 1) * input.pageSize, input.page * input.pageSize)
        : [],
      total: canSelectBillingStart ? all.length : 0,
      page: input.page,
      pageSize: input.pageSize,
    },
    missingFields: (["water", "electricity"] as const)
      .filter(
        (kind) =>
          defaults[`${kind}CollectionEnabled`] &&
          !baselines.some((reading) => reading.kind === kind),
      )
      .map((kind) => `${kind}Baseline`),
  };
}
