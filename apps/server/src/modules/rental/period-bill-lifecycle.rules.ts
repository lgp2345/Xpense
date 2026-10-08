import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
export type PeriodLifecycleFacts = {
  bills: Array<{ id: string; type: string; status: string; periodStart: string | null }>;
  cashEntries: Array<{
    target: { kind: "bill"; billId: string } | { kind: "settlement"; settlementId: string };
    revokedAt: string | Date | null;
  }>;
  settlement: { id: string } | null;
};
/** 写入与读模型共用同一末期和真实资金判断，净额为零不能绕过流水限制。 */
export function periodBillVoidBlockedReason(
  source: PeriodLifecycleFacts,
  billId: string,
): string | null {
  const bill = source.bills.find((bill) => bill.id === billId);
  if (!bill || bill.type !== "period") return "只能作废普通账单";
  if (bill.status !== "active") return "账单已经作废";
  if (source.settlement) return "合同已确认退租结算，不能作废普通账单";
  const last = source.bills
    .filter((bill) => bill.type === "period" && bill.status === "active")
    .toSorted((a, b) => (b.periodStart ?? "").localeCompare(a.periodStart ?? ""))[0];
  if (last?.id !== billId) return "只能作废最后一期有效普通账单，请从后往前逐期处理";
  if (
    source.cashEntries.some(
      (entry) =>
        entry.revokedAt === null && entry.target.kind === "bill" && entry.target.billId === billId,
    )
  )
    return "请先撤销该账单的有效收款和退款记录";
  return null;
}
export function assertPeriodBillVoidable(source: RentalFinanceSnapshot, billId: string): void {
  const reason = periodBillVoidBlockedReason(source, billId);
  if (reason) throw new RangeError(reason);
}
