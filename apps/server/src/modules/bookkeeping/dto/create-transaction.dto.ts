import { transactionTypes } from "@xpense/shared";
import { z } from "zod";

/** 创建和更新普通交易共用的业务输入校验规则。 */
export const transactionInputSchema = z
  .object({
    ledgerId: z.string().uuid(),
    type: z.enum(transactionTypes),
    accountId: z.string().uuid(),
    destinationAccountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    amountMinor: z.number().int().safe().positive(),
    occurredAt: z.string().datetime({ offset: true }),
    payee: z.string().trim().min(1).max(240).optional(),
    note: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

/** 创建普通交易请求校验规则。 */
export const createTransactionSchema = transactionInputSchema;

/** 创建普通交易请求 DTO，由 createTransactionSchema 校验并转换。 */
export type CreateTransactionDto = z.output<typeof createTransactionSchema>;
