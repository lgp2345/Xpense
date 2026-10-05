/** 租期采用组织本地时间，兼容仍只包含日期的历史表单值。 */
export function isContractDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, month - 1, day);
  candidate.setUTCHours(0, 0, 0, 0);
  return (
    year > 0 &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day &&
    (!match[4] || (Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6]) < 60))
  );
}

/** 按本地日期时间展示，避免解析为绝对时刻后发生时区转换。 */
export function formatContractDateTime(value: string | null | undefined): string | undefined {
  return value?.replace("T", " ");
}

export function validContractRange(start: string, end: string): boolean {
  const startTime = start.length === 10 ? `${start}T00:00:00` : start;
  const endTime = end.length === 10 ? `${end}T23:59:59` : end;
  return isContractDateTime(start) && isContractDateTime(end) && startTime <= endTime;
}
