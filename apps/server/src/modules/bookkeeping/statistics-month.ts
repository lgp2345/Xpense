/** 月度统计使用的首尾闭区间账务日期。 */
export type CalendarMonthRange = {
  firstDay: string;
  lastDay: string;
};

/** 判断公历年份是否为闰年。 */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * 将严格 `YYYY-MM` 年月转换为同月首日和末日字符串。
 * 计算只使用公历整数规则，不创建 `Date`，因此不受 UTC 或运行时区影响。
 */
export function toCalendarMonthRange(month: string): CalendarMonthRange {
  const match = /^(?!0000)(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error("Invalid calendar month");

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const daysByMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const lastDay = daysByMonth[monthNumber - 1];
  if (lastDay === undefined) throw new Error("Invalid calendar month");

  return {
    firstDay: `${month}-01`,
    lastDay: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}
