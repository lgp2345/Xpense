import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 查询租赁合同详情的请求校验规则。 */
export const contractDetailSchema = z.object({ id: z.string().uuid() }).strict();

/** 查询租赁合同详情请求 DTO。 */
export class ContractDetailDto extends createZodDto(contractDetailSchema) {}

export const rentalContractDetailSchema = contractDetailSchema;
export { ContractDetailDto as RentalContractDetailDto };
