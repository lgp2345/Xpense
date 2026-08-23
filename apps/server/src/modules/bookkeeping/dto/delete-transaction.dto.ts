import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 软删除交易请求校验规则。 */
export const deleteTransactionSchema = z.object({ id: z.string().uuid() }).strict();

/** 软删除交易请求 DTO。 */
export class DeleteTransactionDto extends createZodDto(deleteTransactionSchema) {}
