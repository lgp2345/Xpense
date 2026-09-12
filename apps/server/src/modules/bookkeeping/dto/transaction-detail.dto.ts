import { z } from "zod";

/** 交易详情查询校验规则。 */
export const transactionDetailSchema = z.object({ id: z.string().uuid() }).strict();

/** 交易详情查询 DTO，由 transactionDetailSchema 校验并转换。 */
export type TransactionDetailDto = z.output<typeof transactionDetailSchema>;
