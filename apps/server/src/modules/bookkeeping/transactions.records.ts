import { type TransactionRecord, type TransactionType, transactionTypes } from "@xpense/shared";

import type { TransactionHeaderRow, TransactionMovementRow } from "./transactions.types.js";

/** 判断数据库交易类型是否可以暴露给普通交易 API。 */
function isOrdinaryTransactionType(value: string): value is TransactionType {
  return transactionTypes.some((type) => type === value);
}

/** 校验金额仍处于 JavaScript 安全整数范围。 */
function requireSafeAmount(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error("交易金额超过 JavaScript 安全整数范围");
  }
}

/**
 * 将交易表头与批量流水显式映射为客户端记录。
 * @param headers 当前页或详情表头。
 * @param movements 同一次批量查询取得的账户流水及历史账户名称。
 * @returns 不含组织、创建人和审计字段的普通交易记录。
 * @throws Error 持久化流水数量、方向或金额与交易主记录不一致时抛出。
 */
export function assembleTransactionRecords(
  headers: TransactionHeaderRow[],
  movements: TransactionMovementRow[],
): TransactionRecord[] {
  const movementsByTransaction = new Map<string, TransactionMovementRow[]>();
  for (const movement of movements) {
    const current = movementsByTransaction.get(movement.transactionId) ?? [];
    current.push(movement);
    movementsByTransaction.set(movement.transactionId, current);
  }

  return headers.map((header) => {
    if (!isOrdinaryTransactionType(header.type)) {
      throw new Error("普通交易查询返回了内部交易类型");
    }
    requireSafeAmount(header.amountMinor);
    const rows = movementsByTransaction.get(header.id) ?? [];
    for (const row of rows) requireSafeAmount(row.amountMinor);

    let source: TransactionMovementRow | undefined;
    let destination: TransactionMovementRow | undefined;
    if (header.type === "income") {
      source =
        rows.length === 1 && rows[0]?.amountMinor === header.amountMinor ? rows[0] : undefined;
    } else if (header.type === "expense") {
      source =
        rows.length === 1 && rows[0]?.amountMinor === -header.amountMinor ? rows[0] : undefined;
    } else {
      source = rows.find((row) => row.amountMinor === -header.amountMinor);
      destination = rows.find((row) => row.amountMinor === header.amountMinor);
      if (rows.length !== 2 || source?.accountId === destination?.accountId) {
        source = undefined;
        destination = undefined;
      }
    }
    if (!source) throw new Error("交易流水与主记录不一致");
    if (header.type === "transfer" && !destination) {
      throw new Error("转账流水与主记录不一致");
    }

    return {
      id: header.id,
      ledgerId: header.ledgerId,
      ledgerName: header.ledgerName,
      type: header.type,
      accountId: source.accountId,
      accountName: source.accountName,
      destinationAccountId: destination?.accountId ?? null,
      destinationAccountName: destination?.accountName ?? null,
      categoryId: header.categoryId,
      categoryName: header.categoryName,
      amountMinor: header.amountMinor,
      occurredAt: header.occurredAt.toISOString(),
      payee: header.payee,
      note: header.note,
      createdAt: header.createdAt.toISOString(),
      updatedAt: header.updatedAt.toISOString(),
    };
  });
}
