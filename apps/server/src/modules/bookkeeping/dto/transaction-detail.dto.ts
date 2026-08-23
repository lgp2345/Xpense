import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 交易详情查询校验规则。 */
export const transactionDetailSchema = z.object({ id: z.string().uuid() }).strict();

/** 交易详情查询 DTO。 */
export class TransactionDetailDto extends createZodDto(transactionDetailSchema) {}
