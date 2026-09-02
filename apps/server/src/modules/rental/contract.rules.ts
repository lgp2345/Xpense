import type {
  RentalBillingAnchor,
  RentalContractLifecycleStatus,
  RentalDepositCalculationMode,
  RentalDepositType,
  RentalPaymentIntervalMonths,
} from "@xpense/shared";

import {
  addCalendarDays,
  assertCalendarDate,
  compareCalendarDates,
  dateRangesOverlap,
} from "./contract-date.rules.js";

type ContractPartyValue = { tenantId: string; isPrimaryPayer: boolean };
type ContractSpaceValue = { spaceId: string; rentAllocationMinor?: number };
type DepositCalculationValue = {
  calculationMode: RentalDepositCalculationMode;
  fixedAmountMinor?: number | null;
  rentMultiple?: string | null;
};
type ContractDepositValue = DepositCalculationValue & {
  type: RentalDepositType;
  customName?: string | null;
};
type ContractPartyPeriodValue = ContractPartyValue & { validFrom: string; validTo: string };

export type ContractAggregateValue = {
  status: RentalContractLifecycleStatus;
  startDate: string | null;
  endDate: string | null;
  rentAmountMinor: number | null;
  billingAnchor: RentalBillingAnchor | null;
  paymentIntervalMonths: RentalPaymentIntervalMonths | number | null;
  dueDaysBefore: number | null;
  terminationDate?: string | null;
  parties: ContractPartyValue[];
  spaces: ContractSpaceValue[];
  depositTerms: ContractDepositValue[];
};

const paymentIntervals = new Set<number>([1, 3, 6, 12]);
const decimalMultiplePattern = /^\d{1,8}(?:\.\d{1,4})?$/;

/** 返回给定公历年月的实际天数。 */
function calendarMonthDays(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 断言金额是大于零的 JavaScript 安全整数。 */
function assertPositiveMoney(amountMinor: number, fieldName: string): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError(`${fieldName}必须是大于零的安全整数`);
  }
}

/** 断言押金计算方式与固定金额或租金倍数字段严格互斥且取值有效。 */
function assertDepositCalculation(term: DepositCalculationValue): void {
  if (term.calculationMode === "fixed_amount") {
    if (
      term.fixedAmountMinor === null ||
      term.fixedAmountMinor === undefined ||
      (term.rentMultiple !== null && term.rentMultiple !== undefined)
    ) {
      throw new RangeError("固定押金只能提供固定金额");
    }
    assertPositiveMoney(term.fixedAmountMinor, "固定押金");
    return;
  }
  if (
    term.calculationMode !== "rent_multiple" ||
    (term.fixedAmountMinor !== null && term.fixedAmountMinor !== undefined) ||
    term.rentMultiple === null ||
    term.rentMultiple === undefined
  ) {
    throw new RangeError("租金倍数押金只能提供租金倍数");
  }
  if (!decimalMultiplePattern.test(term.rentMultiple)) throw new RangeError("租金倍数格式无效");
  if (BigInt(term.rentMultiple.replace(".", "")) <= 0n) {
    throw new RangeError("租金倍数必须大于零");
  }
}

/** 断言押金类型、自定义名称和计算字段构成完整有效的押金约定。 */
function assertContractDepositTerm(term: ContractDepositValue): void {
  const hasCustomName = typeof term.customName === "string" && term.customName.trim().length > 0;
  if ((term.type === "other") !== hasCustomName) {
    throw new RangeError("其他押金类型必须且只能填写自定义名称");
  }
  if (hasCustomName && term.customName && term.customName.length > 120) {
    throw new RangeError("押金自定义名称过长");
  }
  assertDepositCalculation(term);
}

/** 断言当前承租方集合无重复且恰有一名主付款人。 */
function assertCurrentParties(parties: ContractPartyValue[]): void {
  if (parties.length === 0) throw new RangeError("合同至少需要一名承租方");
  if (new Set(parties.map((party) => party.tenantId)).size !== parties.length) {
    throw new RangeError("合同承租方不能重复");
  }
  if (parties.filter((party) => party.isPrimaryPayer).length !== 1) {
    throw new RangeError("合同必须且只能有一名主付款人");
  }
}

/** 断言合同历史任一连续区段都恰有一名有效主付款人。 */
function assertPrimaryPayerCoverage(
  periods: ContractPartyPeriodValue[],
  contractStartDate: string,
  contractEndDate: string,
): void {
  const boundaries = new Set<string>([contractStartDate]);
  for (const period of periods) {
    boundaries.add(period.validFrom);
    if (compareCalendarDates(period.validTo, contractEndDate) < 0) {
      boundaries.add(addCalendarDays(period.validTo, 1));
    }
  }
  for (const boundary of boundaries) {
    if (
      compareCalendarDates(boundary, contractStartDate) < 0 ||
      compareCalendarDates(boundary, contractEndDate) > 0
    ) {
      continue;
    }
    const primaryPayerCount = periods.filter(
      (period) =>
        period.isPrimaryPayer &&
        compareCalendarDates(period.validFrom, boundary) <= 0 &&
        compareCalendarDates(boundary, period.validTo) <= 0,
    ).length;
    if (primaryPayerCount !== 1) {
      throw new RangeError("合同任一有效日期必须且只能有一名主付款人");
    }
  }
}

/** 校验空间 ID 与租金分摊的全有或全无及合计关系。 */
export function assertSpaceAllocations(
  spaces: ContractSpaceValue[],
  rentAmountMinor: number | null,
): void {
  if (new Set(spaces.map((space) => space.spaceId)).size !== spaces.length) {
    throw new RangeError("合同空间不能重复");
  }
  const allocatedCount = spaces.filter((space) => space.rentAllocationMinor !== undefined).length;
  if (allocatedCount === 0) return;
  if (allocatedCount !== spaces.length) throw new RangeError("空间租金分摊必须全部填写或全部不填");
  if (rentAmountMinor === null) throw new RangeError("填写空间租金分摊时必须提供合同租金");
  assertPositiveMoney(rentAmountMinor, "合同租金");
  let total = 0n;
  for (const space of spaces) {
    const allocation = space.rentAllocationMinor;
    if (allocation === undefined) throw new RangeError("空间租金分摊缺失");
    assertPositiveMoney(allocation, "空间租金分摊");
    total += BigInt(allocation);
  }
  if (total !== BigInt(rentAmountMinor)) throw new RangeError("空间租金分摊合计必须等于合同租金");
}

/** 校验承租方历史有效期位于合同内，且同一承租方的闭区间不重叠。 */
export function assertPartyPeriods(
  periods: ContractPartyPeriodValue[],
  contractStartDate: string,
  contractEndDate: string,
): void {
  if (compareCalendarDates(contractStartDate, contractEndDate) > 0) {
    throw new RangeError("合同租期顺序无效");
  }
  for (const period of periods) {
    if (
      compareCalendarDates(period.validFrom, period.validTo) > 0 ||
      compareCalendarDates(period.validFrom, contractStartDate) < 0 ||
      compareCalendarDates(period.validTo, contractEndDate) > 0
    ) {
      throw new RangeError("承租方有效期必须位于合同租期内");
    }
  }
  for (const [index, left] of periods.entries()) {
    for (const right of periods.slice(index + 1)) {
      if (
        left.tenantId === right.tenantId &&
        dateRangesOverlap(left.validFrom, left.validTo, right.validFrom, right.validTo)
      ) {
        throw new RangeError("同一承租方的有效期不能重叠");
      }
    }
  }
  assertPrimaryPayerCoverage(periods, contractStartDate, contractEndDate);
}

/** 按固定金额或租金倍数计算最终押金，倍数最多四位小数并四舍五入。 */
export function finalDepositAmount(term: DepositCalculationValue, rentAmountMinor: number): number {
  assertPositiveMoney(rentAmountMinor, "合同租金");
  assertDepositCalculation(term);
  if (term.calculationMode === "fixed_amount") {
    if (term.fixedAmountMinor === null || term.fixedAmountMinor === undefined) {
      throw new RangeError("固定押金缺少固定金额");
    }
    return term.fixedAmountMinor;
  }
  if (!term.rentMultiple) throw new RangeError("租金倍数押金缺少租金倍数");
  const [whole, fraction = ""] = term.rentMultiple.split(".");
  if (!whole) throw new RangeError("租金倍数格式无效");
  const scale = 10n ** BigInt(fraction.length);
  const multiplier = BigInt(whole) * scale + BigInt(fraction || "0");
  const rounded = (BigInt(rentAmountMinor) * multiplier + scale / 2n) / scale;
  if (rounded <= 0n || rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("最终押金超出安全整数范围");
  }
  return Number(rounded);
}

/** 按起止日所在公历月的实际天数计算含首尾日租金，并以整数四舍五入。 */
export function prorateCalendarMonthRent(amountMinor: number, from: string, to: string): number {
  assertPositiveMoney(amountMinor, "月租金");
  if (from.slice(0, 7) !== to.slice(0, 7) || compareCalendarDates(from, to) > 0) {
    throw new RangeError("按月折算区间必须位于同一公历月");
  }
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const occupiedDays = BigInt(Number(to.slice(8, 10)) - Number(from.slice(8, 10)) + 1);
  const divisor = BigInt(calendarMonthDays(year, month));
  const rounded = (BigInt(amountMinor) * occupiedDays + divisor / 2n) / divisor;
  return Number(rounded);
}

/** 校验合同聚合在当前生命周期下的核心字段与关联集合。 */
export function assertContractAggregate(contract: ContractAggregateValue): void {
  const confirmedLike = contract.status !== "draft";
  if (confirmedLike) {
    if (
      !contract.startDate ||
      !contract.endDate ||
      contract.rentAmountMinor === null ||
      contract.billingAnchor === null ||
      contract.paymentIntervalMonths === null ||
      contract.dueDaysBefore === null
    ) {
      throw new RangeError("非草稿合同必须具备完整租期和计费信息");
    }
    if (contract.spaces.length === 0) throw new RangeError("非草稿合同至少需要一个空间");
  }
  if (contract.startDate !== null) assertCalendarDate(contract.startDate);
  if (contract.endDate !== null) assertCalendarDate(contract.endDate);
  if (
    contract.startDate &&
    contract.endDate &&
    compareCalendarDates(contract.startDate, contract.endDate) > 0
  ) {
    throw new RangeError("合同租期顺序无效");
  }
  const hasTerminationDate =
    contract.terminationDate !== null && contract.terminationDate !== undefined;
  if ((contract.status === "terminated") !== hasTerminationDate) {
    throw new RangeError("已终止状态必须且只能提供终止日期");
  }
  if (contract.terminationDate !== null && contract.terminationDate !== undefined) {
    assertCalendarDate(contract.terminationDate);
    if (
      !contract.startDate ||
      !contract.endDate ||
      compareCalendarDates(contract.terminationDate, contract.startDate) < 0 ||
      compareCalendarDates(contract.terminationDate, contract.endDate) >= 0
    ) {
      throw new RangeError("终止日期必须位于合同租期内且早于原结束日期");
    }
  }
  if (contract.rentAmountMinor !== null) assertPositiveMoney(contract.rentAmountMinor, "合同租金");
  if (
    contract.paymentIntervalMonths !== null &&
    !paymentIntervals.has(contract.paymentIntervalMonths)
  ) {
    throw new RangeError("付款周期不受支持");
  }
  if (
    contract.dueDaysBefore !== null &&
    (!Number.isSafeInteger(contract.dueDaysBefore) ||
      contract.dueDaysBefore < 0 ||
      contract.dueDaysBefore > 90)
  ) {
    throw new RangeError("提前付款天数必须在 0 到 90 之间");
  }
  if (contract.parties.length > 0 || confirmedLike) assertCurrentParties(contract.parties);
  assertSpaceAllocations(contract.spaces, contract.rentAmountMinor);
  for (const term of contract.depositTerms) {
    assertContractDepositTerm(term);
    if (contract.rentAmountMinor !== null) finalDepositAmount(term, contract.rentAmountMinor);
  }
}
