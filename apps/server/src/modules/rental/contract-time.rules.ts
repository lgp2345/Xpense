import { assertCalendarDate } from "./contract-date.rules.js";

type ContractBoundary = "start" | "end";

const contractDateTimePattern = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/;
const postgresLocalDateTimePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** 严格解析合同日期或不带时区的本地日期时间。 */
function parseContractTime(value: string): { day: string; time: string | null } {
  const match = contractDateTimePattern.exec(value);
  if (!match) throw new RangeError("合同日期时间必须使用 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss 格式");
  const day = match[1] as string;
  const hour = match[2];
  const minute = match[3];
  const second = match[4];
  assertCalendarDate(day);
  if (hour === undefined || minute === undefined || second === undefined) {
    return { day, time: null };
  }
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new RangeError("合同时间不是有效本地时间");
  }
  return { day, time: `${hour}:${minute}:${second}` };
}

/** 将旧合同日期扩展为对应时间边界，并保留合法输入中的秒。 */
export function normalizeContractTime(value: string, boundary: ContractBoundary): string {
  const { day, time } = parseContractTime(value);
  return `${day}T${time ?? (boundary === "start" ? "00:00:00" : "23:59:59")}`;
}

/** 规范化数据库返回的合同本地日期时间；空值仍表示草稿尚未填写。 */
export function normalizeStoredContractTime(
  value: string | null,
  boundary: ContractBoundary,
): string | null {
  if (value === null) return null;
  const normalized = postgresLocalDateTimePattern.test(value) ? value.replace(" ", "T") : value;
  return normalizeContractTime(normalized, boundary);
}

/** 从严格合同日期或日期时间中提取经过校验的公历日。 */
export function contractCalendarDay(value: string): string {
  return parseContractTime(value).day;
}

/** 按组织 IANA 时区把绝对时刻转换为不带偏移的本地日期时间。 */
export function organizationDateTime(now: Date, timezone: string): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError("当前时刻无效");

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new RangeError("组织时区无效");
  }

  const parts = new Map(
    formatter
      .formatToParts(now)
      .filter((part) => ["year", "month", "day", "hour", "minute", "second"].includes(part.type))
      .map((part) => [part.type, part.value]),
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  const second = parts.get("second");
  if (!year || !month || !day || !hour || !minute || !second) {
    throw new RangeError("无法计算组织本地日期时间");
  }
  const calendarDay = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  assertCalendarDate(calendarDay);
  return `${calendarDay}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
}

/** 返回合同最后实际占用时刻；提前终止时采用终止日最后一秒。 */
export function actualContractEndTime(endDate: string, terminationDate?: string | null): string {
  const scheduledEnd = normalizeContractTime(endDate, "end");
  if (terminationDate === null || terminationDate === undefined) return scheduledEnd;
  assertCalendarDate(terminationDate);
  return `${terminationDate}T23:59:59`;
}
