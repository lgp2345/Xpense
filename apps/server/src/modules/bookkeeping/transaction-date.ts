/**
 * 按组织 IANA 时区把交易时刻换算为账务日期。
 * @param occurredAt 有效的绝对发生时刻。
 * @param timeZone 组织配置的有效 IANA 时区。
 * @returns `YYYY-MM-DD` 格式的组织本地账务日期。
 * @throws RangeError 日期无效或时区不能被当前运行环境识别时抛出。
 */
export function toOccurredOn(occurredAt: Date, timeZone: string): string {
  if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
    throw new RangeError("交易发生时间无效");
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new RangeError("组织时区无效");
  }

  const parts = new Map(
    formatter
      .formatToParts(occurredAt)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value]),
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");

  if (!year || !month || !day) {
    throw new RangeError("无法计算交易账务日期");
  }

  return `${year}-${month}-${day}`;
}
