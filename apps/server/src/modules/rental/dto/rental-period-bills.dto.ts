import { z } from "zod";
import { contractCalendarDateSchema } from "./rental-calendar-date.schema.js";
import {
  rentalExpectedVersionSchema,
  rentalFeeNameSchema,
  rentalIdempotencyKeySchema,
  rentalPeriodOverridesSchema,
  rentalReasonSchema,
  rentalSafeMinorAmountSchema,
} from "./rental-charges.dto.js";
import { optionalRentalMeterReadingsSchema } from "./rental-meters.dto.js";
/** 账期与结算额外收费事项，金额正负明确且条目有稳定标识。 */
export const rentalExtraFeeInputSchema = z
  .object({
    id: z.string().uuid(),
    name: rentalFeeNameSchema,
    amountMinor: rentalSafeMinorAmountSchema,
    note: z.string().trim().max(1000),
  })
  .strict();
/** 候选期分页不影响下一期判定；禁止客户端提交账期结束日或金额。 */
export const periodBillContextSchema = z
  .object({
    contractId: z.string().uuid(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const shape = {
  contractId: z.string().uuid(),
  periodStart: contractCalendarDateSchema,
  billingStart: z
    .object({
      firstPeriodStart: contractCalendarDateSchema,
      baselineReadings: optionalRentalMeterReadingsSchema,
    })
    .strict()
    .optional(),
  dueDate: contractCalendarDateSchema.optional(),
  readings: optionalRentalMeterReadingsSchema.optional(),
  overrides: rentalPeriodOverridesSchema.optional(),
  extraFees: z.array(rentalExtraFeeInputSchema),
};
/** 预览可以缺少读数，由服务端返回可补齐的业务缺项。 */
export const previewRentalPeriodBillSchema = z.object(shape).strict();
/** 正式生成绑定服务端预览版本与期初，同日不同账单仍保存独立快照。 */
export const generateRentalPeriodBillSchema = z
  .object({
    ...shape,
    dueDate: contractCalendarDateSchema,
    readings: optionalRentalMeterReadingsSchema,
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
  })
  .strict();
/** 普通账单仅允许带原因的末期作废，不能直接修改金额。 */
export const voidRentalPeriodBillSchema = z
  .object({
    billId: z.string().uuid(),
    reason: rentalReasonSchema,
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
  })
  .strict();
export type PeriodBillContextDto = z.output<typeof periodBillContextSchema>;
export type PreviewRentalPeriodBillDto = z.output<typeof previewRentalPeriodBillSchema>;
export type GenerateRentalPeriodBillDto = z.output<typeof generateRentalPeriodBillSchema>;
export type VoidRentalPeriodBillDto = z.output<typeof voidRentalPeriodBillSchema>;
