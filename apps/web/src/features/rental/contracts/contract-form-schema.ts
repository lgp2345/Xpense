import type {
  CreateConfirmedRentalContractRequest,
  CreateRentalContractRequest,
  RentalBillingMode,
  RentalContractDepositTermInput,
  RentalContractDetail,
  RentalContractSpaceInput,
  RentalPaymentIntervalMonths,
  UpdateRentalContractRequest,
} from "@xpense/shared";
import { z } from "zod";
import {
  type ContractChargeFormValues,
  contractChargeFormSchema,
  toContractChargeSetup,
} from "../charges/contract-charge-form";
import { isContractDateTime, validContractRange } from "./contract-date-time";

export type ContractFormValues = {
  /** 由服务端合同模式恢复；新合同默认月度结算，不提供用户切换入口。 */
  billingMode?: RentalBillingMode;
  chargeSetup: ContractChargeFormValues | null;
  propertyId: string;
  spaces: { spaceId: string; rentAllocationText: string }[];
  parties: { tenantId: string; isPrimaryPayer: boolean }[];
  externalContractNumber: string;
  startDate: string;
  endDate: string;
  rentAmountText: string;
  billingAnchor: "contract_start" | "calendar_month" | "";
  paymentIntervalMonths: "1" | "3" | "6" | "12" | "";
  dueDaysBeforeText: string;
  deposits: {
    type: "rental" | "utility" | "access_card" | "other";
    customName: string;
    calculationMode: "fixed_amount";
    fixedAmountText: string;
  }[];
  note: string;
};

const uuid = z.string().uuid("请输入有效的 ID");
const date = z.string().refine(isContractDateTime, "请输入有效日期时间");
const space = z.object({ spaceId: uuid, rentAllocationText: z.string() });
const billingMode = z
  .enum(["legacy_receivable", "monthly_settlement"])
  .default("monthly_settlement");
const party = z.object({ tenantId: uuid, isPrimaryPayer: z.boolean() });
const deposit = z.object({
  type: z.enum(["rental", "utility", "access_card", "other"]),
  customName: z.string(),
  calculationMode: z.literal("fixed_amount"),
  fixedAmountText: z.string(),
});

/** 首次创建草稿只需要验证启用房产候选的 ID；空间和条款属于后续检查点。 */
export const createContractFormSchema = z.object({ propertyId: uuid });

export const contractFormSchema = z
  .object({
    billingMode,
    propertyId: uuid,
    spaces: z.array(space).min(1, "至少选择一个空间"),
    parties: z.array(party).min(1, "至少选择一个承租方"),
    externalContractNumber: z.string(),
    startDate: date,
    endDate: date,
    rentAmountText: z.string().min(1, "请输入月租"),
    billingAnchor: z.enum(["contract_start", "calendar_month"], { error: "请选择计费方式" }),
    paymentIntervalMonths: z.enum(["1", "3", "6", "12"], { error: "请选择付款周期" }),
    dueDaysBeforeText: z.string().regex(/^\d+$/, "到期规则必须是整数"),
    deposits: z.array(deposit),
    chargeSetup: contractChargeFormSchema.nullable().default(null),
    note: z.string(),
  })
  .superRefine((value, ctx) => {
    validateSpaceCount(value, ctx);
    const uniqueSpaces = new Set(value.spaces.map((item) => item.spaceId));
    if (uniqueSpaces.size !== value.spaces.length)
      ctx.addIssue({ code: "custom", path: ["spaces"], message: "不能重复选择空间" });
    const payers = value.parties.filter((item) => item.isPrimaryPayer).length;
    if (payers !== 1)
      ctx.addIssue({ code: "custom", path: ["parties"], message: "必须且只能有一名主付款人" });
    if (new Set(value.parties.map((item) => item.tenantId)).size !== value.parties.length)
      ctx.addIssue({ code: "custom", path: ["parties"], message: "不能重复选择承租方" });
    if (!isContractDateTime(value.startDate))
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "请输入有效日期",
      });
    if (!isContractDateTime(value.endDate))
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "请输入有效日期" });
    if (value.startDate && value.endDate && !isValidDate(value.startDate, value.endDate))
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "结束日期不能早于开始日期" });
    const rent = parseMinor(value.rentAmountText);
    if (value.rentAmountText && rent === null)
      ctx.addIssue({ code: "custom", path: ["rentAmountText"], message: "请输入正整数金额" });
    const due = Number(value.dueDaysBeforeText);
    if (!Number.isInteger(due) || due < 0 || due > 90)
      ctx.addIssue({
        code: "custom",
        path: ["dueDaysBeforeText"],
        message: "到期规则必须是 0 到 90 的整数",
      });
    const allocations = value.spaces.map((item) => item.rentAllocationText.trim());
    const anyAllocation = allocations.some(Boolean);
    if (anyAllocation && allocations.some((item) => !item))
      ctx.addIssue({ code: "custom", path: ["spaces"], message: "租金分摊必须全部填写或全部留空" });
    if (anyAllocation) {
      const total = allocations.reduce<number | null>((sum, item) => {
        const amount = parseMinor(item);
        return sum === null || amount === null ? null : sum + amount;
      }, 0);
      if (rent !== null && total !== rent)
        ctx.addIssue({ code: "custom", path: ["spaces"], message: "租金分摊合计必须等于基础月租" });
    }
    validateDeposits(value.deposits, ctx);
  });

export const stepSchemas = {
  spaces: z
    .object({ billingMode, propertyId: uuid, spaces: z.array(space).min(1, "至少选择一个空间") })
    .superRefine((value, ctx) => {
      validateSpaceCount(value, ctx);
      if (new Set(value.spaces.map((item) => item.spaceId)).size !== value.spaces.length)
        ctx.addIssue({ code: "custom", path: ["spaces"], message: "不能重复选择空间" });
    }),
  parties: z
    .object({ parties: z.array(party).min(1, "至少选择一个承租方") })
    .superRefine((value, ctx) => {
      if (value.parties.filter((item) => item.isPrimaryPayer).length !== 1)
        ctx.addIssue({ code: "custom", path: ["parties"], message: "必须且只能有一名主付款人" });
      if (new Set(value.parties.map((item) => item.tenantId)).size !== value.parties.length)
        ctx.addIssue({ code: "custom", path: ["parties"], message: "不能重复选择承租方" });
    }),
  terms: z
    .object({
      billingMode,
      externalContractNumber: z.string(),
      startDate: date,
      endDate: date,
      rentAmountText: z.string().min(1, "请输入月租"),
      billingAnchor: z.enum(["contract_start", "calendar_month"], { error: "请选择计费方式" }),
      paymentIntervalMonths: z.enum(["1", "3", "6", "12"], { error: "请选择付款周期" }),
      dueDaysBeforeText: z.string().regex(/^\d+$/, "到期规则必须是整数"),
      spaces: z.array(space).min(1, "至少选择一个空间"),
      deposits: z.array(deposit),
      chargeSetup: contractChargeFormSchema.nullable().default(null),
      note: z.string(),
    })
    .superRefine((value, ctx) => {
      validateSpaceCount(value, ctx);
      if (!isValidDate(value.startDate, value.endDate))
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "结束日期不能早于开始日期或日期无效",
        });
      const rent = parseMinor(value.rentAmountText);
      if (value.rentAmountText && rent === null)
        ctx.addIssue({ code: "custom", path: ["rentAmountText"], message: "请输入正整数金额" });
      const due = Number(value.dueDaysBeforeText);
      if (!/^\d+$/.test(value.dueDaysBeforeText) || !Number.isInteger(due) || due < 0 || due > 90)
        ctx.addIssue({
          code: "custom",
          path: ["dueDaysBeforeText"],
          message: "到期规则必须是 0 到 90 的整数",
        });
      const allocations = value.spaces.map((item) => item.rentAllocationText.trim());
      const anyAllocation = allocations.some(Boolean);
      if (anyAllocation && allocations.some((item) => !item))
        ctx.addIssue({
          code: "custom",
          path: ["spaces"],
          message: "租金分摊必须全部填写或全部留空",
        });
      if (anyAllocation) {
        const total = allocations.reduce<number | null>((sum, item) => {
          const amount = parseMinor(item);
          return sum === null || amount === null ? null : sum + amount;
        }, 0);
        if (rent !== null && total !== rent)
          ctx.addIssue({
            code: "custom",
            path: ["spaces"],
            message: "租金分摊合计必须等于基础月租",
          });
      }
      if (new Set(value.spaces.map((item) => item.spaceId)).size !== value.spaces.length)
        ctx.addIssue({ code: "custom", path: ["spaces"], message: "不能重复选择空间" });
      validateDeposits(value.deposits, ctx);
    }),
};

/** 保留旧合同多空间兼容，月度结算在每个含空间的检查点限制为单选。 */
function validateSpaceCount(
  value: Pick<ContractFormValues, "billingMode" | "spaces">,
  ctx: z.RefinementCtx,
): void {
  if (value.billingMode !== "legacy_receivable" && value.spaces.length > 1)
    ctx.addIssue({ code: "custom", path: ["spaces"], message: "合同只能选择一个空间" });
}

export function defaultContractFormValues(propertyId = ""): ContractFormValues {
  return {
    billingMode: "monthly_settlement",
    propertyId,
    chargeSetup: null,
    spaces: [],
    parties: [],
    externalContractNumber: "",
    startDate: "",
    endDate: "",
    rentAmountText: "",
    billingAnchor: "",
    paymentIntervalMonths: "",
    dueDaysBeforeText: "30",
    deposits: [],
    note: "",
  };
}

export function toContractFormValues(
  detail: RentalContractDetail,
  chargeSetup: ContractChargeFormValues | null = null,
): ContractFormValues {
  return {
    billingMode: detail.billingMode ?? "legacy_receivable",
    chargeSetup,
    propertyId: detail.propertyId,
    spaces: detail.spaces.map((item) => ({
      spaceId: item.spaceId,
      rentAllocationText:
        item.rentAllocationMinor === null ? "" : formatMinor(item.rentAllocationMinor),
    })),
    parties: detail.parties.map((item) => ({
      tenantId: item.tenantId,
      isPrimaryPayer: item.isPrimaryPayer,
    })),
    externalContractNumber: detail.externalContractNumber ?? "",
    startDate: detail.startDate ?? "",
    endDate: detail.endDate ?? "",
    rentAmountText: detail.rentAmountMinor === null ? "" : formatMinor(detail.rentAmountMinor),
    billingAnchor: detail.billingAnchor ?? "",
    paymentIntervalMonths: detail.paymentIntervalMonths
      ? (String(detail.paymentIntervalMonths) as ContractFormValues["paymentIntervalMonths"])
      : "",
    dueDaysBeforeText: detail.dueDaysBefore === null ? "" : String(detail.dueDaysBefore),
    deposits: detail.depositTerms
      .filter((item) => item.calculationMode === "fixed_amount")
      .map((item) => ({
        type: item.type,
        customName: item.customName ?? "",
        calculationMode: "fixed_amount",
        fixedAmountText: item.fixedAmountMinor === null ? "" : formatMinor(item.fixedAmountMinor),
      })),
    note: detail.note ?? "",
  };
}

export function parseMinor(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parts = normalized.split(".");
  const whole = parts[0] ?? "";
  const fraction = parts[1] ?? "";
  try {
    const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    if (result <= 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(result);
  } catch {
    return null;
  }
}

export function isValidDate(start: string, end: string): boolean {
  return validContractRange(start, end);
}

function formatMinor(value: number): string {
  const whole = Math.floor(value / 100);
  const fraction = value % 100;
  return fraction === 0
    ? String(whole)
    : `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

function validateDeposits(deposits: ContractFormValues["deposits"], ctx: z.RefinementCtx): void {
  for (const [index, item] of deposits.entries()) {
    if (item.type === "other" && !item.customName.trim())
      ctx.addIssue({
        code: "custom",
        path: ["deposits", index, "customName"],
        message: "请输入押金名称",
      });
    if (parseMinor(item.fixedAmountText) === null)
      ctx.addIssue({
        code: "custom",
        path: ["deposits", index, "fixedAmountText"],
        message: "请输入正整数金额",
      });
  }
}

export function toCreateContractRequest(
  values: Pick<ContractFormValues, "propertyId"> | ContractFormValues,
): CreateRentalContractRequest {
  const parsed = createContractFormSchema.parse(values);
  return { propertyId: parsed.propertyId };
}

export function toStepUpdateRequest(
  id: string,
  values: ContractFormValues,
  step: 0 | 1 | 2,
): UpdateRentalContractRequest {
  if (step === 0) {
    const parsed = stepSchemas.spaces.parse({
      billingMode: values.billingMode,
      propertyId: values.propertyId,
      spaces: values.spaces,
    });
    return { id, propertyId: parsed.propertyId, spaces: parsed.spaces.map(toSpaceInput) };
  }
  if (step === 1) {
    const parsed = stepSchemas.parties.parse({ parties: values.parties });
    return {
      id,
      parties: parsed.parties.map(({ tenantId, isPrimaryPayer }) => ({ tenantId, isPrimaryPayer })),
    };
  }
  const parsed = stepSchemas.terms.parse(values);
  return {
    id,
    externalContractNumber: nullable(parsed.externalContractNumber),
    startDate: nullable(parsed.startDate),
    endDate: nullable(parsed.endDate),
    rentAmountMinor: parsed.rentAmountText ? parseMinor(parsed.rentAmountText) : null,
    billingAnchor: parsed.billingAnchor || null,
    paymentIntervalMonths: parsed.paymentIntervalMonths
      ? (Number(parsed.paymentIntervalMonths) as RentalPaymentIntervalMonths)
      : null,
    dueDaysBefore: parsed.dueDaysBeforeText ? Number(parsed.dueDaysBeforeText) : null,
    spaces: parsed.spaces.map(toSpaceInput),
    depositTerms: parsed.deposits.map((item, sortOrder) => toDepositInput(item, sortOrder)),
    ...(parsed.chargeSetup ? { chargeSetup: toContractChargeSetup(parsed.chargeSetup) } : {}),
    note: nullable(parsed.note),
  };
}

function toSpaceInput(item: ContractFormValues["spaces"][number]): RentalContractSpaceInput {
  const allocation = item.rentAllocationText.trim() ? parseMinor(item.rentAllocationText) : null;
  return allocation === null
    ? { spaceId: item.spaceId }
    : { spaceId: item.spaceId, rentAllocationMinor: allocation };
}
function toDepositInput(
  item: ContractFormValues["deposits"][number],
  sortOrder: number,
): RentalContractDepositTermInput {
  const result: RentalContractDepositTermInput = {
    type: item.type,
    calculationMode: "fixed_amount",
    sortOrder,
  };
  if (item.type === "other") result.customName = item.customName.trim();
  result.fixedAmountMinor = parseMinor(item.fixedAmountText) ?? undefined;
  return result;
}
function nullable(value: string): string | null {
  return value.trim() || null;
}

export function allocationSummary(values: ContractFormValues): { total: number; valid: boolean } {
  const amounts = values.spaces.map((item) => parseMinor(item.rentAllocationText));
  return {
    total: amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0),
    valid: amounts.every((amount) => amount !== null),
  };
}

/** 将全部已校验步骤转换为一次性正式合同创建请求。 */
export function toConfirmedContractRequest(
  values: ContractFormValues,
): CreateConfirmedRentalContractRequest {
  const parsed = contractFormSchema.parse({ ...values, billingMode: "monthly_settlement" });
  return {
    propertyId: parsed.propertyId,
    externalContractNumber: nullable(parsed.externalContractNumber),
    spaces: parsed.spaces.map(toSpaceInput),
    parties: parsed.parties,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    rentAmountMinor: parseMinor(parsed.rentAmountText) as number,
    billingAnchor: parsed.billingAnchor,
    paymentIntervalMonths: Number(parsed.paymentIntervalMonths) as RentalPaymentIntervalMonths,
    dueDaysBefore: Number(parsed.dueDaysBeforeText),
    depositTerms: parsed.deposits.map(toDepositInput),
    ...(parsed.chargeSetup ? { chargeSetup: toContractChargeSetup(parsed.chargeSetup) } : {}),
    note: nullable(parsed.note),
  };
}
