/** 按整数分显示金额；预览使用组织本位币，已生成账单明确显示币种快照。 */
export function formatBillAmount(amountMinor: number | bigint, currencyCode?: string): string {
  const minor = BigInt(amountMinor);
  const absolute = minor < 0n ? -minor : minor;
  const value = `${minor < 0n ? "-" : ""}${(absolute / 100n).toLocaleString("zh-CN")}.${String(absolute % 100n).padStart(2, "0")}`;
  return currencyCode ? `${currencyCode} ${value}` : value;
}

/** 按服务端租金规则展示舍入到分的日单价，总额仍取账单快照。 */
export function formatDailyRent(amountMinor: number, referenceDays: number): string {
  const minor = BigInt(amountMinor);
  const days = BigInt(referenceDays);
  const roundedMinor = (minor * 2n + days) / (days * 2n);
  return `${(roundedMinor / 100n).toLocaleString("zh-CN")}.${String(roundedMinor % 100n).padStart(2, "0")}`;
}
