import type { RentalCashEntry, RentalCashTarget } from "@xpense/shared";
import { calculateRentalBalance } from "./rental-balance.rules.js";
import type { RentalCashRecord } from "./rental-cash.repository.types.js";

const maximum = BigInt(Number.MAX_SAFE_INTEGER);

export type RentalCashBalanceEntry = {
  target?: RentalCashTarget;
  billId?: string | null;
  settlementId?: string | null;
  kind: string;
  amountMinor: number;
  revokedAt: Date | string | null;
};

/** 用合同当前全部有效资金或唯一账单目标事实推导余额。 */
export function calculateRentalCashBalance(
  entries: readonly RentalCashBalanceEntry[],
  target: RentalCashTarget,
  amountMinor: number,
  dueDate: string | null,
  today: string,
) {
  let received = 0n;
  let refunded = 0n;
  for (const entry of entries) {
    if (entry.revokedAt !== null) continue;
    if (target.kind === "bill" && !sameTarget(entry, target)) continue;
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0)
      throw new RangeError("有效收退款必须为正安全整数");
    if (entry.kind === "receipt") received += BigInt(entry.amountMinor);
    else refunded += BigInt(entry.amountMinor);
  }
  if (received > maximum || refunded > maximum) throw new RangeError("收退款累计超出安全整数范围");
  return calculateRentalBalance(amountMinor, Number(received), Number(refunded), dueDate, today);
}

/** 仓储记录只映射为公开现金事实，不向调用方暴露组织键和数据库日期对象。 */
export function toRentalCashEntry(record: RentalCashRecord): RentalCashEntry {
  const target = record.billId
    ? ({ kind: "bill", billId: record.billId } as const)
    : record.settlementId
      ? ({ kind: "settlement", settlementId: record.settlementId } as const)
      : null;
  if (!target) throw new Error("Rental cash entry has no scoped target");
  return {
    id: record.id,
    contractId: record.contractId,
    target,
    kind: record.kind,
    purpose: record.purpose,
    amountMinor: record.amountMinor,
    occurredOn: record.occurredOn,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    createdByUserId: record.createdByUserId,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    revokedByUserId: record.revokedByUserId,
    revokeReason: record.revokeReason,
  };
}

function sameTarget(entry: RentalCashBalanceEntry, target: RentalCashTarget): boolean {
  const entryTarget =
    entry.target ??
    (entry.billId
      ? { kind: "bill", billId: entry.billId }
      : entry.settlementId
        ? { kind: "settlement", settlementId: entry.settlementId }
        : null);
  return (
    entryTarget?.kind === "bill" && target.kind === "bill" && entryTarget.billId === target.billId
  );
}
