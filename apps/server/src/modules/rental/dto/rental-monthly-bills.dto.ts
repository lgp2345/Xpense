import { z } from "zod";

import { contractCalendarDateSchema } from "./rental-calendar-date.schema.js";
import {
  rentalExpectedVersionSchema,
  rentalIdempotencyKeySchema,
  rentalMonthlyOverridesSchema,
  rentalReasonSchema,
  rentalSafeMinorAmountSchema,
} from "./rental-charges.dto.js";
import {
  optionalRentalMeterReadingsSchema,
  rentalCompleteMeterReadingsSchema,
} from "./rental-meters.dto.js";

/** 出账月份必须是有效格式 YYYY-MM。 */
export const rentalBillingMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "出账月份格式无效")
  .refine(
    (value) => contractCalendarDateSchema.safeParse(`${value}-01`).success,
    "出账月份不是有效公历日期",
  );

/** 每项额外费用显式保存名称、有符号金额和可空备注。 */
export const rentalExtraFeeInputSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    amountMinor: rentalSafeMinorAmountSchema,
    note: z.string().trim().max(1000),
  })
  .strict();

const monthlyBillPreviewShape = {
  contractId: z.string().uuid(),
  billingMonth: rentalBillingMonthSchema,
  dueDate: contractCalendarDateSchema.optional(),
  readings: optionalRentalMeterReadingsSchema.optional(),
  overrides: rentalMonthlyOverridesSchema.optional(),
  extraFees: z.array(rentalExtraFeeInputSchema),
};

/** 预览月度综合账单；缺读数和截止日时仍可显示待完善结果。 */
export const previewRentalMonthlyBillSchema = z.object(monthlyBillPreviewShape).strict();

/** 确认月度综合账单；正式出账必须补齐截止日及两类表计读数。 */
export const generateRentalMonthlyBillSchema = z
  .object({
    ...monthlyBillPreviewShape,
    dueDate: contractCalendarDateSchema,
    readings: rentalCompleteMeterReadingsSchema,
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
  })
  .strict();

/** 更正已确认账单及其实际受影响的抄表边界。 */
const reviseRentalBillObject = z
  .object({
    mode: z.enum(["edit_unpaid", "correction"]).optional(),
    fixedFeeAdjustments: z
      .array(
        z.discriminatedUnion("action", [
          z
            .object({
              feeId: z.string().uuid(),
              action: z.literal("set_amount"),
              amountMinor: rentalSafeMinorAmountSchema.min(0),
            })
            .strict(),
          z.object({ feeId: z.string().uuid(), action: z.literal("remove") }).strict(),
        ]),
      )
      .optional(),
    billId: z.string().uuid(),
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
    readings: optionalRentalMeterReadingsSchema.optional(),
    overrides: rentalMonthlyOverridesSchema.optional(),
    extraFees: z.array(rentalExtraFeeInputSchema).optional(),
    reason: rentalReasonSchema,
  })
  .strict();

/** 预览与确认复用费用去重，省略协议字段必须在添加跨字段规则之前进行。 */
function refineRevision(
  value: z.output<typeof reviseRentalBillObject>,
  context: z.RefinementCtx,
): void {
  const ids = value.fixedFeeAdjustments?.map(({ feeId }) => feeId) ?? [];
  if (
    new Set(ids).size !== ids.length ||
    value.overrides?.fixedFees?.some(({ id }) => ids.includes(id))
  ) {
    context.addIssue({ code: "custom", message: "同一费用不能重复调整或同时使用旧覆盖" });
  }
}
export const reviseRentalBillSchema = reviseRentalBillObject.superRefine(refineRevision);
/** 修订预览不接受幂等键，但保留同样的费用交叉校验。 */
export const previewRentalBillRevisionSchema = reviseRentalBillObject
  .omit({ idempotencyKey: true })
  .superRefine((value, context) => refineRevision({ ...value, idempotencyKey: "" }, context));

/** 月度账单预览的校验后输入。 */
export type PreviewRentalMonthlyBillDto = z.output<typeof previewRentalMonthlyBillSchema>;
/** 月度账单生成的校验后输入。 */
export type GenerateRentalMonthlyBillDto = z.output<typeof generateRentalMonthlyBillSchema>;
/** 月度账单修订的校验后输入。 */
export type ReviseRentalBillDto = z.output<typeof reviseRentalBillSchema>;
