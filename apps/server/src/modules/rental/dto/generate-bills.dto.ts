import { z } from "zod";

import { billGenerationInputShape } from "./preview-bills.dto.js";

/** 确认全租期计划，不接受页码或客户端租金。 */
export const generateBillsSchema = z
  .object({
    ...billGenerationInputShape,
    expectedVersion: z.string().min(1).max(200),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

/** 账单生成输入。 */
export type GenerateBillsDto = z.output<typeof generateBillsSchema>;
