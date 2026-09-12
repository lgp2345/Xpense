import { z } from "zod";

/** 软删除交易请求校验规则。 */
export const deleteTransactionSchema = z.object({ id: z.string().uuid() }).strict();

/** 软删除交易请求 DTO，由 deleteTransactionSchema 校验并转换。 */
export type DeleteTransactionDto = z.output<typeof deleteTransactionSchema>;
