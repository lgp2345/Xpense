/** 读取 URL search 中的非空字符串，不改变原始空白。 */
export function readSearchString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** 读取并修剪非空 URL 字符串。 */
export function readTrimmedSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/** 读取合法的 YYYY-MM-DD 日期。 */
export function readSearchDate(value: unknown): string | undefined {
  const date = readSearchString(value);

  if (!date || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) {
    return undefined;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

/** 读取正整数页码。 */
export function readSearchPage(value: unknown): number | undefined {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}
