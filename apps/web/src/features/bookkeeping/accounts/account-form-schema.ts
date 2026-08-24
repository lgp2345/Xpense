import { accountTypes } from "@xpense/shared";
import { z } from "zod";

import type { CreateAccountRequest, UpdateAccountRequest } from "../../../services/bookkeeping-api";

const decimalAmountPattern = /^-?(0|[1-9]\d*)(\.\d{1,2})?$/;
const iconPattern = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;

/** 账户表单保留字符串输入，避免输入阶段产生浮点金额。 */
export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "请输入账户名称").max(120, "账户名称不能超过 120 个字符"),
  type: z.enum(accountTypes),
  icon: z
    .string()
    .trim()
    .refine((value) => value === "" || iconPattern.test(value), "图标格式不正确"),
  color: z
    .string()
    .trim()
    .refine((value) => value === "" || colorPattern.test(value), "颜色格式不正确"),
  sortOrder: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (/^-?\d+$/.test(value) &&
          Number(value) >= -2_147_483_648 &&
          Number(value) <= 2_147_483_647),
      "排序值必须是有效整数",
    ),
  initialBalance: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || canParseDecimalAmount(value),
      "请输入最多两位小数的安全金额",
    ),
});

/** 账户表单原始值。 */
export type AccountFormValues = z.infer<typeof accountFormSchema>;

/**
 * 将十进制金额字符串精确转换为最小货币单位。
 * @throws 输入不是普通十进制、超过两位小数或超出安全整数范围时抛出错误。
 */
export function parseDecimalAmountToMinor(input: string): number {
  const value = input.trim();
  const match = decimalAmountPattern.exec(value);

  if (!match) {
    throw new Error("Invalid decimal amount");
  }

  const isNegative = value.startsWith("-");
  const unsigned = isNegative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const absoluteMinor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signedMinor = isNegative ? -absoluteMinor : absoluteMinor;

  if (
    signedMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
    signedMinor < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("Amount exceeds safe integer range");
  }

  return Number(signedMinor);
}

/** 将创建表单转换为服务端请求。 */
export function toCreateAccountRequest(values: AccountFormValues): CreateAccountRequest {
  return {
    name: values.name.trim(),
    type: values.type,
    ...(values.icon.trim() ? { icon: values.icon.trim() } : {}),
    ...(values.color.trim() ? { color: values.color.trim() } : {}),
    ...(values.sortOrder.trim() ? { sortOrder: Number(values.sortOrder) } : {}),
    ...(values.initialBalance.trim()
      ? { initialBalanceMinor: parseDecimalAmountToMinor(values.initialBalance) }
      : {}),
  };
}

/** 将编辑表单转换为服务端请求。 */
export function toUpdateAccountRequest(values: AccountFormValues): UpdateAccountRequest {
  return {
    name: values.name.trim(),
    type: values.type,
    icon: values.icon.trim() || null,
    color: values.color.trim() || null,
    sortOrder: Number(values.sortOrder || "0"),
  };
}

/** 判断金额能否安全转换，供 Zod refine 使用。 */
function canParseDecimalAmount(value: string): boolean {
  try {
    parseDecimalAmountToMinor(value);
    return true;
  } catch {
    return false;
  }
}
