import { formatMinorMoney } from "@xpense/shared";
/** 传入币种快照或当前组织币种；null仅用于明确不带币种的纯数字。 */
export function formatBillAmount(
  amountMinor: number | bigint,
  currencyCode: string | null,
): string {
  return currencyCode === null
    ? formatMinorMoney(amountMinor, "").replace(" ", "")
    : formatMinorMoney(amountMinor, currencyCode);
}

/** 按服务端租金规则展示舍入到分的日单价，总额仍取账单快照。 */
export function formatDailyRent(amountMinor: number, referenceDays: number): string {
  const minor = BigInt(amountMinor);
  const days = BigInt(referenceDays);
  const roundedMinor = (minor * 2n + days) / (days * 2n);
  return `${(roundedMinor / 100n).toLocaleString("zh-CN")}.${String(roundedMinor % 100n).padStart(2, "0")}`;
}
