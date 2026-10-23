import { formatMinorMoney, type TransactionRecord } from "@xpense/shared";

import { formatIsoForLocalDateTime } from "./transaction-date-time";

const typeLabels: Record<TransactionRecord["type"], string> = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
};

/** 返回交易类型中文标签。 */
export function transactionTypeLabel(type: TransactionRecord["type"]): string {
  return typeLabels[type];
}

/** 用整数分值格式化交易金额，避免安全整数边界丢失。 */
export function formatTransactionAmount(
  amountMinor: number,
  type: TransactionRecord["type"],
  currencyCode: string,
): string {
  const prefix = type === "expense" ? "-" : type === "income" ? "+" : "";
  return `${prefix}${formatMinorMoney(amountMinor, currencyCode)}`;
}

/** 将 ISO 时间压缩为桌面表格可扫描的年月日与时分。 */
export function formatTransactionDate(value: string, timezoneOffsetMinutes?: number): string {
  return formatIsoForLocalDateTime(value, timezoneOffsetMinutes).replace("T", " ");
}
