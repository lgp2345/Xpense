import { z } from "zod";
/** 按扫描到的合同分页，不按筛选后候选数推断是否还有后续。 */
export const listPropertyBillingSchema = z
  .object({
    propertyId: z.string().uuid(),
    afterContractId: z.string().uuid().optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();
export type ListPropertyBillingDto = z.output<typeof listPropertyBillingSchema>;
