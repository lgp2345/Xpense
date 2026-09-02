import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";

/** 查看合同历史承租方敏感快照请求校验规则。 */
export const revealContractPartySensitiveSchema = z
  .object({
    contractId: z.string().uuid(),
    tenantId: z.string().uuid(),
    validFrom: contractCalendarDateSchema,
  })
  .strict();

/** 查看合同历史承租方敏感快照请求 DTO。 */
export class RevealContractPartySensitiveDto extends createZodDto(
  revealContractPartySensitiveSchema,
) {}

export const revealRentalContractPartySensitiveSchema = revealContractPartySensitiveSchema;
export { RevealContractPartySensitiveDto as RevealRentalContractPartySensitiveDto };
