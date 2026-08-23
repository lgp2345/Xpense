import type { UpsertTransactionRequest } from "@xpense/shared";

/** 单条账户资金方向流水；金额使用最小货币单位的非零安全整数。 */
export type TransactionMovement = {
  accountId: string;
  amountMinor: number;
};

/**
 * 把普通交易转换为账户流水。
 * @param input 已通过请求校验的收入、支出或转账；金额为正安全整数最小货币单位。
 * @returns 收入一正、支出一负，或转账来源负数与目标正数的等额流水。
 * @throws RangeError 金额不是正安全整数时抛出。
 * @throws Error 交易类型、转账账户形态不符合普通交易规则时抛出。
 */
export function buildMovements(input: UpsertTransactionRequest): TransactionMovement[] {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new RangeError("交易金额必须是正安全整数");
  }

  if (input.type === "income") {
    return [{ accountId: input.accountId, amountMinor: input.amountMinor }];
  }

  if (input.type === "expense") {
    return [{ accountId: input.accountId, amountMinor: -input.amountMinor }];
  }

  if (input.type !== "transfer") {
    throw new Error("普通交易仅支持收入、支出和转账");
  }

  if (!input.destinationAccountId) {
    throw new Error("转账必须指定目标账户");
  }
  if (input.destinationAccountId === input.accountId) {
    throw new Error("转账来源账户和目标账户必须不同");
  }

  return [
    { accountId: input.accountId, amountMinor: -input.amountMinor },
    { accountId: input.destinationAccountId, amountMinor: input.amountMinor },
  ];
}
