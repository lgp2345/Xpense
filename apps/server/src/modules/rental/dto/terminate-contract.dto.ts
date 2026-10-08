import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";

/** 提前终止租赁合同请求校验规则。 */
export const terminateContractSchema = z
  .object({
    id: z.string().uuid(),
    terminationDate: contractCalendarDateSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

/** 提前终止租赁合同请求 DTO，由 terminateContractSchema 校验并转换。 */
export type TerminateContractDto = z.output<typeof terminateContractSchema>;

export const terminateRentalContractSchema = terminateContractSchema;
export type { TerminateContractDto as TerminateRentalContractDto };
