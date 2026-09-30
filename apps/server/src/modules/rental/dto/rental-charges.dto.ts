import { z } from "zod";

/** 收费条目名称在合同内可识别，且去除首尾空白。 */
export const rentalFeeNameSchema = z.string().trim().min(1).max(100);

/** 水电单价最多四位小数并匹配 numeric(20,4) 存储范围。 */
export const rentalDecimalFourSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/, "请输入最多四位小数且不超过存储范围的非负数");

/** 安全整数最小单位金额，可按调用场景进一步限制正负。 */
export const rentalSafeMinorAmountSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

/** 并发更新使用的不透明来源版本。 */
export const rentalExpectedVersionSchema = z.string().trim().min(1).max(200);

/** 写入请求使用 UUID 幂等键。 */
export const rentalIdempotencyKeySchema = z.string().uuid();

/** 需要留痕的原因不能为空。 */
export const rentalReasonSchema = z.string().trim().min(1).max(1000);

/** 合同收费标准中的完整固定月费条目。 */
export const rentalFixedFeeSchema = z
  .object({
    id: z.string().uuid(),
    name: rentalFeeNameSchema,
    monthlyAmountMinor: rentalSafeMinorAmountSchema.min(0),
  })
  .strict();

/** 本期固定费用按合同条目 ID 覆盖月金额。 */
export const rentalFixedFeeOverrideSchema = z
  .object({
    id: z.string().uuid(),
    monthlyAmountMinor: rentalSafeMinorAmountSchema.min(0),
  })
  .strict();

/** 本期非租金覆盖必须留原因，不改合同默认收费标准。 */
export const rentalMonthlyOverridesSchema = z
  .object({
    waterUnitPrice: rentalDecimalFourSchema.optional(),
    electricityUnitPrice: rentalDecimalFourSchema.optional(),
    fixedFees: z.array(rentalFixedFeeOverrideSchema).optional(),
    reason: rentalReasonSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.fixedFees) {
      const ids = value.fixedFees.map(({ id }) => id);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: "custom", message: "固定费用覆盖项不能重复" });
      }
    }
  });

/** 修改合同的水电单价和固定月费默认值。 */
export const updateRentalChargeTermsSchema = z
  .object({
    contractId: z.string().uuid(),
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
    reason: rentalReasonSchema,
    waterUnitPrice: rentalDecimalFourSchema,
    electricityUnitPrice: rentalDecimalFourSchema,
    fixedFees: z.array(rentalFixedFeeSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.fixedFees.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "固定费用条目 ID 不能重复" });
    }
  });

/** 修改收费条款的校验后输入。 */
export type UpdateRentalChargeTermsDto = z.output<typeof updateRentalChargeTermsSchema>;
