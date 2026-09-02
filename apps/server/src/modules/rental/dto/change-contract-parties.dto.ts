import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { contractCalendarDateSchema, contractPartyInputSchema } from "./create-contract.dto.js";

/** 变更合同承租方请求校验规则。 */
export const changeContractPartiesSchema = z
  .object({
    id: z.string().uuid(),
    effectiveDate: contractCalendarDateSchema,
    reason: z.string().trim().min(1).max(1000),
    parties: z.array(contractPartyInputSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.parties.map((party) => party.tenantId)).size !== value.parties.length) {
      context.addIssue({ code: "custom", message: "合同承租方不能重复" });
    }
    if (value.parties.filter((party) => party.isPrimaryPayer).length !== 1) {
      context.addIssue({ code: "custom", message: "合同必须且只能有一名主付款人" });
    }
  });

/** 变更合同承租方请求 DTO。 */
export class ChangeContractPartiesDto extends createZodDto(changeContractPartiesSchema) {}

export const changeRentalContractPartiesSchema = changeContractPartiesSchema;
export { ChangeContractPartiesDto as ChangeRentalContractPartiesDto };
