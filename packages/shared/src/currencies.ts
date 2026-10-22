export const CURRENCIES = [
  { code: "CNY", name: "人民币", symbol: "¥", minorUnitDigits: 2 },
  { code: "USD", name: "美元", symbol: "$", minorUnitDigits: 2 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

/** 将整数最小货币单位格式化为金额；未知历史币种保留代码，不隐式换汇。 */
export function formatMinorMoney(amountMinor: number | bigint, currencyCode: string): string {
  const amount = BigInt(amountMinor);
  const absolute = amount < 0n ? -amount : amount;
  const prefix =
    CURRENCIES.find((currency) => currency.code === currencyCode)?.symbol ?? `${currencyCode} `;
  return `${amount < 0n ? "-" : ""}${prefix}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
