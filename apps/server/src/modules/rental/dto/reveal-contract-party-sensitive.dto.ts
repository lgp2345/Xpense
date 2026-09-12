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

/** 经过历史承租方敏感快照 schema 校验并转换后的业务输入。 */
export type RevealContractPartySensitiveDto = z.output<typeof revealContractPartySensitiveSchema>;

export const revealRentalContractPartySensitiveSchema = revealContractPartySensitiveSchema;
export type { RevealContractPartySensitiveDto as RevealRentalContractPartySensitiveDto };
