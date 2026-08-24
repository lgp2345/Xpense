import type { CategoryNode, TransactionRecord, UpsertTransactionRequest } from "@xpense/shared";
import { transactionTypes } from "@xpense/shared";
import { z } from "zod";

import { parseDecimalAmountToMinor } from "../accounts/account-form-schema";
import { formatIsoForLocalDateTime, localDateTimeToIso } from "./transaction-date-time";

/** 交易弹窗的字符串表单契约。 */
export const transactionFormSchema = z
  .object({
    ledgerId: z.string().min(1, "请选择账本"),
    type: z.enum(transactionTypes),
    accountId: z.string().min(1, "请选择账户"),
    destinationAccountId: z.string(),
    categoryId: z.string(),
    amount: z
      .string()
      .trim()
      .min(1, "请输入金额")
      .refine(canParsePositiveAmount, "请输入最多两位小数的安全正数金额"),
    occurredAt: z.string().min(1, "请选择发生时间"),
    payee: z.string().trim().max(120, "收付款方不能超过 120 个字符"),
    note: z.string().trim().max(500, "备注不能超过 500 个字符"),
  })
  .superRefine((value, context) => {
    if (value.type === "transfer") {
      if (!value.destinationAccountId) {
        context.addIssue({
          code: "custom",
          path: ["destinationAccountId"],
          message: "请选择目标账户",
        });
      } else if (value.destinationAccountId === value.accountId) {
        context.addIssue({
          code: "custom",
          path: ["destinationAccountId"],
          message: "转账账户必须不同",
        });
      }
      return;
    }
    if (!value.categoryId) {
      context.addIssue({ code: "custom", path: ["categoryId"], message: "请选择分类" });
    }
  });

/** 交易表单原始字符串值。 */
export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

/** 校验所选分类确实属于当前账本及交易类型。 */
export function isTransactionCategoryCompatible(
  values: Pick<TransactionFormValues, "categoryId" | "ledgerId" | "type">,
  categories: CategoryNode[],
): boolean {
  if (values.type === "transfer") return true;

  const category = categories
    .flatMap((root) => [root, ...root.children])
    .find((item) => item.id === values.categoryId);
  return category?.ledgerId === values.ledgerId && category.type === values.type;
}

/** 将安全整数最小货币单位精确回填为十进制字符串。 */
export function formatMinorForInput(amountMinor: number): string {
  const amount = BigInt(amountMinor);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** 从现有交易或依赖默认值构建精确表单回填。 */
export function createTransactionFormValues(
  transaction: TransactionRecord | undefined,
  defaults: { ledgerId?: string; accountId?: string },
): TransactionFormValues {
  return {
    ledgerId: transaction?.ledgerId ?? defaults.ledgerId ?? "",
    type: transaction?.type ?? "expense",
    accountId: transaction?.accountId ?? defaults.accountId ?? "",
    destinationAccountId: transaction?.destinationAccountId ?? "",
    categoryId: transaction?.categoryId ?? "",
    amount: transaction ? formatMinorForInput(transaction.amountMinor) : "",
    occurredAt: transaction
      ? formatIsoForLocalDateTime(transaction.occurredAt)
      : formatIsoForLocalDateTime(new Date().toISOString()),
    payee: transaction?.payee ?? "",
    note: transaction?.note ?? "",
  };
}

/** 将已校验表单精确转换为普通交易写请求。 */
export function toUpsertTransactionRequest(
  values: TransactionFormValues,
): UpsertTransactionRequest {
  return {
    ledgerId: values.ledgerId,
    type: values.type,
    accountId: values.accountId,
    ...(values.type === "transfer"
      ? { destinationAccountId: values.destinationAccountId }
      : { categoryId: values.categoryId }),
    amountMinor: parseDecimalAmountToMinor(values.amount),
    occurredAt: localDateTimeToIso(values.occurredAt),
    ...(values.payee.trim() ? { payee: values.payee.trim() } : {}),
    ...(values.note.trim() ? { note: values.note.trim() } : {}),
  };
}

/** 判断金额字符串是否能精确转换为大于零的安全整数分值。 */
function canParsePositiveAmount(value: string): boolean {
  try {
    return parseDecimalAmountToMinor(value) > 0;
  } catch {
    return false;
  }
}
