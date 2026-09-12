import { z } from "zod";

/** 查询租赁合同详情的请求校验规则。 */
export const contractDetailSchema = z.object({ id: z.string().uuid() }).strict();

/** 查询租赁合同详情请求 DTO，由 contractDetailSchema 校验并转换。 */
export type ContractDetailDto = z.output<typeof contractDetailSchema>;

export const rentalContractDetailSchema = contractDetailSchema;
export type { ContractDetailDto as RentalContractDetailDto };
