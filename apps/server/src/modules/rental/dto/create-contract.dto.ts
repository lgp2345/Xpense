import {
  rentalBillingAnchors,
  rentalDepositCalculationModes,
  rentalDepositTypes,
} from "@xpense/shared";
import { z } from "zod";
import { assertSpaceAllocations } from "../contract.rules.js";
import { assertCalendarDate } from "../contract-date.rules.js";

const optionalNullableText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(maxLength).nullable().optional(),
  );

const money = z.number().int().positive();

/** 合同 DTO 共用的严格公历日期校验规则。 */
export const contractCalendarDateSchema = z.string().superRefine((value, context) => {
  try {
    assertCalendarDate(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "合同日期无效",
    });
  }
});

/** 合同承租方输入校验规则。 */
export const contractPartyInputSchema = z
  .object({
    tenantId: z.string().uuid(),
    isPrimaryPayer: z.boolean(),
  })
  .strict();

/** 合同空间输入校验规则。 */
export const contractSpaceInputSchema = z
  .object({
    spaceId: z.string().uuid(),
    rentAllocationMinor: money.optional(),
  })
  .strict();

const rentMultiple = z
  .string()
  .regex(/^\d{1,8}(?:\.\d{1,4})?$/)
  .refine((value) => BigInt(value.replace(".", "")) > 0n, "租金倍数必须大于零");

/** 合同押金约定输入校验规则。 */
export const contractDepositTermInputSchema = z
  .object({
    type: z.enum(rentalDepositTypes),
    customName: z.string().trim().min(1).max(120).optional(),
    calculationMode: z.enum(rentalDepositCalculationModes),
    fixedAmountMinor: money.optional(),
    rentMultiple: rentMultiple.optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.type === "other") !== (value.customName !== undefined)) {
      context.addIssue({ code: "custom", message: "其他押金类型必须且只能填写自定义名称" });
    }
    const fixedValid =
      value.calculationMode === "fixed_amount" &&
      value.fixedAmountMinor !== undefined &&
      value.rentMultiple === undefined;
    const multipleValid =
      value.calculationMode === "rent_multiple" &&
      value.fixedAmountMinor === undefined &&
      value.rentMultiple !== undefined;
    if (!fixedValid && !multipleValid) {
      context.addIssue({ code: "custom", message: "押金计算字段与计算方式不匹配" });
    }
  });

const mutableShape = {
  propertyId: z.string().uuid().optional(),
  externalContractNumber: optionalNullableText(120),
  startDate: contractCalendarDateSchema.nullable().optional(),
  endDate: contractCalendarDateSchema.nullable().optional(),
  rentAmountMinor: money.nullable().optional(),
  billingAnchor: z.enum(rentalBillingAnchors).nullable().optional(),
  paymentIntervalMonths: z
    .union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)])
    .nullable()
    .optional(),
  dueDaysBefore: z.number().int().min(0).max(90).nullable().optional(),
  parties: z.array(contractPartyInputSchema).min(1).max(100).optional(),
  spaces: z.array(contractSpaceInputSchema).min(1).max(100).optional(),
  depositTerms: z.array(contractDepositTermInputSchema).max(100).optional(),
  note: optionalNullableText(2000),
};

/** 对 DTO 中同时出现的合同关联字段执行聚合校验。 */
export function refineContractDtoCollections(
  value: {
    startDate?: string | null;
    endDate?: string | null;
    rentAmountMinor?: number | null;
    parties?: Array<z.infer<typeof contractPartyInputSchema>>;
    spaces?: Array<z.infer<typeof contractSpaceInputSchema>>;
  },
  context: z.RefinementCtx,
): void {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: "custom", message: "合同开始日期不能晚于结束日期" });
  }
  if (value.parties) {
    if (new Set(value.parties.map((party) => party.tenantId)).size !== value.parties.length) {
      context.addIssue({ code: "custom", message: "合同承租方不能重复" });
    }
    if (value.parties.filter((party) => party.isPrimaryPayer).length !== 1) {
      context.addIssue({ code: "custom", message: "合同必须且只能有一名主付款人" });
    }
  }
  if (value.spaces) {
    try {
      assertSpaceAllocations(value.spaces, value.rentAmountMinor ?? null);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "合同空间分摊不合法",
      });
    }
  }
}

/** 创建租赁合同草稿的请求校验规则。 */
export const createContractSchema = z
  .object({ ...mutableShape, propertyId: z.string().uuid() })
  .strict()
  .superRefine(refineContractDtoCollections);

/** 创建租赁合同草稿请求 DTO，由 createContractSchema 校验并转换。 */
export type CreateContractDto = z.output<typeof createContractSchema>;

export const createRentalContractSchema = createContractSchema;
export type { CreateContractDto as CreateRentalContractDto };
export { mutableShape as contractMutableShape };
