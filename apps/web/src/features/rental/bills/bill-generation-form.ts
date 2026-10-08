import { z } from "zod";
import { isCalendarDate } from "../contracts/contract-action-model";

export const billGenerationFormSchema = z.object({
  depositDueDates: z.record(z.string(), z.string().refine(isCalendarDate, "请输入有效日期")),
  unifiedDate: z.string(),
});
export type BillGenerationValues = z.input<typeof billGenerationFormSchema>;
