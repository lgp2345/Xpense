import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";

/** 终止当期整张账单的金额确认；零金额合法。 */
export const billingAmountConfirmationShape = {
  finalAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(1).max(1000),
};

/** 仅接受必要的计费输入，正常租金由服务端计算。 */
export const billGenerationInputShape = {
  contractId: z.string().uuid(),
  depositDueDates: z.record(z.string().min(1).max(200), contractCalendarDateSchema).default({}),
  scope: z.literal("deposits").optional(),
  terminationConfirmation: z.object(billingAmountConfirmationShape).strict().optional(),
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
