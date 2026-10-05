import type { RentalContractDisplayStatus, RentalContractLifecycleStatus } from "@xpense/shared";

import {
  actualContractEndTime,
  contractCalendarDay,
  normalizeContractTime,
} from "./contract-time.rules.js";

type CalendarDateParts = { year: number; month: number; day: number };

export type ContractDisplayStatusSource = {
  status: RentalContractLifecycleStatus;
  startDate: string | null;
  endDate: string | null;
  terminationDate?: string | null;
};

export type DerivedContractDisplayStatus = {
  displayStatus: RentalContractDisplayStatus;
  hasScheduledTermination: boolean;
};

/** 返回合同最后实际占用日；提前终止时不改写原始结束日。 */
export function actualContractEnd(endDate: string, terminationDate?: string | null): string {
  assertCalendarDate(endDate);
  if (terminationDate !== null && terminationDate !== undefined)
    assertCalendarDate(terminationDate);
  return terminationDate ?? endDate;
}

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 判断公历年份是否为闰年。 */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** 返回指定公历月份的天数。 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 解析并严格校验 `YYYY-MM-DD` 公历日期。 */
export function parseCalendarDate(value: string): CalendarDateParts {
  const match = calendarDatePattern.exec(value);
  if (!match) throw new RangeError("合同日期必须使用 YYYY-MM-DD 格式");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError("合同日期不是有效公历日期");
  }
  return { year, month, day };
}

/** 断言输入是年份 0001 至 9999 的严格 `YYYY-MM-DD` 公历日期。 */
export function assertCalendarDate(value: string): void {
  parseCalendarDate(value);
}

/** 把公历日期转换为相对 1970-01-01 的整数日序。 */
export function calendarDateToDayNumber({ year, month, day }: CalendarDateParts): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** 把整数日序转换为公历年月日。 */
export function dayNumberToCalendarDate(dayNumber: number): CalendarDateParts {
  const shifted = dayNumber + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth + (shiftedMonth < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

/** 格式化已校验的公历年月日。 */
export function formatCalendarDate({ year, month, day }: CalendarDateParts): string {
  if (year < 1 || year > 9999) throw new RangeError("合同日期超出支持范围");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 按组织 IANA 时区把绝对时刻换算为组织本地日期。 */
export function organizationDate(now: Date, timezone: string): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError("当前时刻无效");
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new RangeError("组织时区无效");
  }
  const parts = new Map(
    formatter
      .formatToParts(now)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value]),
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  if (!year || !month || !day) throw new RangeError("无法计算组织本地日期");
  return formatCalendarDate(parseCalendarDate(`${year}-${month}-${day}`));
}

/** 比较两个公历日期，分别返回 -1、0 或 1。 */
export function compareCalendarDates(left: string, right: string): -1 | 0 | 1 {
  const leftDay = calendarDateToDayNumber(parseCalendarDate(left));
  const rightDay = calendarDateToDayNumber(parseCalendarDate(right));
  return leftDay === rightDay ? 0 : leftDay < rightDay ? -1 : 1;
}

/** 在公历日期上增减整数天，不经由运行时 Date 或本地时区。 */
export function addCalendarDays(date: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError("日期增量必须是安全整数");
  const result = calendarDateToDayNumber(parseCalendarDate(date)) + days;
  if (!Number.isSafeInteger(result)) throw new RangeError("日期增量超出支持范围");
  return formatCalendarDate(dayNumberToCalendarDate(result));
}

/** 判断两个含首尾日期的闭区间是否重叠。 */
export function dateRangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): boolean {
  if (
    compareCalendarDates(firstStart, firstEnd) > 0 ||
    compareCalendarDates(secondStart, secondEnd) > 0
  ) {
    throw new RangeError("合同日期区间顺序无效");
  }
  return (
    compareCalendarDates(firstStart, secondEnd) <= 0 &&
    compareCalendarDates(secondStart, firstEnd) <= 0
  );
}

/** 根据生命周期、组织今天与租期派生合同页面展示状态。 */
export function deriveContractDisplayStatus(
  contract: ContractDisplayStatusSource,
  today: string,
): DerivedContractDisplayStatus {
  const now = normalizeContractTime(today, "start");
  const start = contract.startDate === null ? null : normalizeContractTime(contract.startDate, "start");
  const end = contract.endDate === null ? null : normalizeContractTime(contract.endDate, "end");
  if (contract.terminationDate !== null && contract.terminationDate !== undefined) {
    assertCalendarDate(contract.terminationDate);
    const terminationDay = contract.terminationDate;
    if (
      !start ||
      !end ||
      compareCalendarDates(terminationDay, contractCalendarDay(start)) < 0 ||
      compareCalendarDates(terminationDay, contractCalendarDay(end)) >= 0
    ) {
      throw new RangeError("终止日期必须位于合同租期内且早于原结束日期");
    }
  }
  if (start && end && start > end) {
    throw new RangeError("合同租期顺序无效");
  }
  if (contract.status === "draft" || contract.status === "cancelled") {
    return { displayStatus: contract.status, hasScheduledTermination: false };
  }
  if (!start || !end) throw new RangeError("非草稿合同缺少租期");
  const scheduledTermination = contract.status === "terminated" ? contract.terminationDate : null;
  if (contract.status === "terminated" && !scheduledTermination) {
    throw new RangeError("已终止合同缺少终止日期");
  }
  const actualEnd = actualContractEndTime(end, scheduledTermination);
  if (scheduledTermination && now > actualEnd) {
    return { displayStatus: "terminated", hasScheduledTermination: false };
  }
  const hasScheduledTermination = Boolean(scheduledTermination);
  if (now < start) {
    return { displayStatus: "upcoming", hasScheduledTermination };
  }
  if (now > actualEnd) {
    return { displayStatus: "expired", hasScheduledTermination };
  }
  const expiringThreshold = `${addCalendarDays(contractCalendarDay(actualEnd), -30)}${actualEnd.slice(10)}`;
  return {
    displayStatus: now >= expiringThreshold ? "expiring_soon" : "active",
    hasScheduledTermination,
  };
}
