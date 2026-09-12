import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";

/** 检查合同空间可用性的请求校验规则。 */
export const checkContractAvailabilitySchema = z
  .object({
    propertyId: z.string().uuid(),
    spaceIds: z.array(z.string().uuid()).min(1).max(100),
    startDate: contractCalendarDateSchema,
    endDate: contractCalendarDateSchema,
    excludeContractId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.spaceIds).size !== value.spaceIds.length) {
      context.addIssue({ code: "custom", message: "待检查空间不能重复" });
    }
    if (value.startDate > value.endDate) {
      context.addIssue({ code: "custom", message: "合同开始日期不能晚于结束日期" });
    }
  });

/** 检查合同空间可用性请求 DTO，由 checkContractAvailabilitySchema 校验并转换。 */
export type CheckContractAvailabilityDto = z.output<typeof checkContractAvailabilitySchema>;

export const checkRentalContractAvailabilitySchema = checkContractAvailabilitySchema;
export type { CheckContractAvailabilityDto as CheckRentalContractAvailabilityDto };
