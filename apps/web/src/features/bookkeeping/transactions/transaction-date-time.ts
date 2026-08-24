/** 将 ISO 瞬间按浏览器本地偏移转换为 datetime-local 字符串。 */
export function formatIsoForLocalDateTime(
  value: string,
  timezoneOffsetMinutes = new Date(value).getTimezoneOffset(),
): string {
  const localTimestamp = new Date(value).getTime() - timezoneOffsetMinutes * 60_000;
  return new Date(localTimestamp).toISOString().slice(0, 16);
}

/** 将 datetime-local 字符串按浏览器本地偏移转换为服务端 ISO 瞬间。 */
export function localDateTimeToIso(value: string, timezoneOffsetMinutes?: number): string {
  if (timezoneOffsetMinutes === undefined) {
    return new Date(value).toISOString();
  }

  const localTimestampAsUtc = new Date(`${value}:00.000Z`).getTime();
  return new Date(localTimestampAsUtc + timezoneOffsetMinutes * 60_000).toISOString();
}
