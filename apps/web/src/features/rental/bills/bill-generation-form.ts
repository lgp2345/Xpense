import { z } from "zod";
import { isCalendarDate } from "../contracts/contract-action-model";

/** 整期最终应收允许零；使用十进制整数解析，避免浮点金额。 */
export function parseTerminationAmount(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount = BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
export const billGenerationFormSchema = z.object({
  depositDueDates: z.record(z.string(), z.string().refine(isCalendarDate, "请输入有效日期")),
  unifiedDate: z.string(),
  amountText: z.string(),
  reason: z.string().max(1000, "原因最多 1000 字"),
});
export type BillGenerationValues = z.input<typeof billGenerationFormSchema>;
