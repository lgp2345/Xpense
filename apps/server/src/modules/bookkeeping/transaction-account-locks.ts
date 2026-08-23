import type { UpsertTransactionRequest } from "@xpense/shared";

/**
 * 计算一笔普通交易需要锁定的账户 ID，并按稳定升序去重。
 * @param input 收入、支出或转账业务输入。
 * @returns 收入/支出仅来源账户；转账包含来源和目标账户。
 * @throws Error 目标账户缺失、与来源相同或出现在非转账交易时抛出。
 */
export function buildTransactionAccountLockIds(input: UpsertTransactionRequest): string[] {
  if (input.type !== "transfer") {
    if (input.destinationAccountId !== undefined) {
      throw new Error("收支交易不能指定目标账户");
    }
    return [input.accountId];
  }

  if (!input.destinationAccountId) throw new Error("转账必须指定目标账户");
  if (input.destinationAccountId === input.accountId) {
    throw new Error("转账来源账户和目标账户必须不同");
  }

  return [...new Set([input.accountId, input.destinationAccountId])].sort();
}

/**
 * 判断批量行锁查询是否精确返回全部请求账户且没有重复或额外记录。
 * @param requestedIds 已去重的请求账户 ID。
 * @param lockedRows 行锁查询返回的账户主键。
 */
export function hasExactLockedAccounts(
  requestedIds: string[],
  lockedRows: Array<{ id: string }>,
): boolean {
  const returnedIds = new Set(lockedRows.map((row) => row.id));

  return (
    lockedRows.length === requestedIds.length &&
    returnedIds.size === requestedIds.length &&
    requestedIds.every((id) => returnedIds.has(id))
  );
}
