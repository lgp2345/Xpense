import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";

/** 仅接受必要的计费输入，正常租金由服务端计算。 */
export const billGenerationInputShape = {
  contractId: z.string().uuid(),
  depositDueDates: z.record(z.string().min(1).max(200), contractCalendarDateSchema).default({}),
  scope: z.literal("deposits"),
};

/** 预览支持分页；后续页必须携带同一完整计划版本。 */
export const previewBillsSchema = z
  .object({
    ...billGenerationInputShape,
    expectedVersion: z.string().min(1).max(200).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.page > 1 && !value.expectedVersion) {
      context.addIssue({ code: "custom", message: "后续预览页需要原计划版本" });
    }
  });

/** 账单只读预览输入。 */
export type PreviewBillsDto = z.output<typeof previewBillsSchema>;
