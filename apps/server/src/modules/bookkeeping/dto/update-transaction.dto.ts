import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { transactionInputSchema } from "./create-transaction.dto.js";

/** 更新普通交易请求校验规则；更新始终提交完整业务输入。 */
export const updateTransactionSchema = transactionInputSchema.extend({ id: z.string().uuid() });

/** 更新普通交易请求 DTO。 */
export class UpdateTransactionDto extends createZodDto(updateTransactionSchema) {}
