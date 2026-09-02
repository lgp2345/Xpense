import type {
  CreateRentalContractRequest,
  RentalContractDepositTermInput,
  RentalContractDetail,
  RentalContractSpaceInput,
  RentalPaymentIntervalMonths,
  UpdateRentalContractRequest,
} from "@xpense/shared";
import { z } from "zod";

export type ContractFormValues = {
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
    calculationMode: "fixed_amount" | "rent_multiple";
    fixedAmountText: string;
    rentMultipleText: string;
  }[];
  note: string;
};

const uuid = z.string().uuid("请输入有效的 ID");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请输入有效日期（YYYY-MM-DD）");
const space = z.object({ spaceId: uuid, rentAllocationText: z.string() });
const party = z.object({ tenantId: uuid, isPrimaryPayer: z.boolean() });
const deposit = z.object({
  type: z.enum(["rental", "utility", "access_card", "other"]),
  customName: z.string(),
  calculationMode: z.enum(["fixed_amount", "rent_multiple"]),
  fixedAmountText: z.string(),
  rentMultipleText: z.string(),
});

/** 首次创建草稿只需要验证启用房产候选的 ID；空间和条款属于后续检查点。 */
export const createContractFormSchema = z.object({ propertyId: uuid });

export const contractFormSchema = z
  .object({
    propertyId: uuid,
    spaces: z.array(space).min(1, "至少选择一个空间"),
    parties: z.array(party).min(1, "至少选择一个承租方"),
    externalContractNumber: z.string(),
    startDate: date,
    endDate: date,
    rentAmountText: z.string().min(1, "请输入月租"),
    billingAnchor: z.enum(["contract_start", "calendar_month"]),
    paymentIntervalMonths: z.enum(["1", "3", "6", "12"]),
    dueDaysBeforeText: z.string().regex(/^\d+$/, "到期规则必须是整数"),
    deposits: z.array(deposit),
    note: z.string(),
  })
  .superRefine((value, ctx) => {
    const uniqueSpaces = new Set(value.spaces.map((item) => item.spaceId));
    if (uniqueSpaces.size !== value.spaces.length)
      ctx.addIssue({ code: "custom", path: ["spaces"], message: "不能重复选择空间" });
    const payers = value.parties.filter((item) => item.isPrimaryPayer).length;
    if (payers !== 1)
      ctx.addIssue({ code: "custom", path: ["parties"], message: "必须且只能有一名主付款人" });
    if (new Set(value.parties.map((item) => item.tenantId)).size !== value.parties.length)
      ctx.addIssue({ code: "custom", path: ["parties"], message: "不能重复选择承租方" });
    if (!isCalendarDate(value.startDate))
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "请输入有效日期（YYYY-MM-DD）",
      });
    if (!isCalendarDate(value.endDate))
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "请输入有效日期（YYYY-MM-DD）" });
    if (value.startDate && value.endDate && !isValidDate(value.startDate, value.endDate))
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "结束日期不能早于开始日期" });
    const rent = parseMinor(value.rentAmountText);
    if (rent === null)
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
    .object({ propertyId: uuid, spaces: z.array(space).min(1, "至少选择一个空间") })
    .superRefine((value, ctx) => {
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
      externalContractNumber: z.string(),
      startDate: date,
      endDate: date,
      rentAmountText: z.string(),
      billingAnchor: z.enum(["contract_start", "calendar_month"]),
      paymentIntervalMonths: z.enum(["1", "3", "6", "12"]),
      dueDaysBeforeText: z.string().regex(/^\d+$/, "到期规则必须是整数"),
      spaces: z.array(space).min(1, "至少选择一个空间"),
      deposits: z.array(deposit),
      note: z.string(),
    })
    .superRefine((value, ctx) => {
      if (!isValidDate(value.startDate, value.endDate))
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "结束日期不能早于开始日期或日期无效",
        });
      const rent = parseMinor(value.rentAmountText);
      if (rent === null)
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

export function defaultContractFormValues(propertyId = ""): ContractFormValues {
  return {
    propertyId,
    spaces: [],
    parties: [],
    externalContractNumber: "",
    startDate: "",
    endDate: "",
    rentAmountText: "",
    billingAnchor: "",
    paymentIntervalMonths: "",
    dueDaysBeforeText: "",
    deposits: [],
    note: "",
  };
}

export function toContractFormValues(detail: RentalContractDetail): ContractFormValues {
  return {
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
    deposits: detail.depositTerms.map((item) => ({
      type: item.type,
      customName: item.customName ?? "",
      calculationMode: item.calculationMode,
      fixedAmountText: item.fixedAmountMinor === null ? "" : formatMinor(item.fixedAmountMinor),
      rentMultipleText: item.rentMultiple ?? "",
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

export function isPositiveDecimal(value: string): boolean {
  return (
    /^(?:\d+\.\d+|\d+)$/.test(value.trim()) && Number(value) > 0 && Number.isFinite(Number(value))
  );
}

export function isValidDate(start: string, end: string): boolean {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split("-").map(Number);
    const year = parts[0] ?? 0;
    const month = parts[1] ?? 0;
    const day = parts[2] ?? 0;
    const dateValue = new Date(Date.UTC(year, month - 1, day));
    return (
      dateValue.getUTCFullYear() === year &&
      dateValue.getUTCMonth() === month - 1 &&
      dateValue.getUTCDate() === day
    );
  };
  return valid(start) && valid(end) && start <= end;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    year > 0 &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
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
    if (item.calculationMode === "fixed_amount" && parseMinor(item.fixedAmountText) === null)
      ctx.addIssue({
        code: "custom",
        path: ["deposits", index, "fixedAmountText"],
        message: "请输入正整数金额",
      });
    if (item.calculationMode === "rent_multiple" && !isPositiveDecimal(item.rentMultipleText))
      ctx.addIssue({
        code: "custom",
        path: ["deposits", index, "rentMultipleText"],
        message: "请输入正数倍数",
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
    calculationMode: item.calculationMode,
    sortOrder,
  };
  if (item.type === "other") result.customName = item.customName.trim();
  if (item.calculationMode === "fixed_amount")
    result.fixedAmountMinor = parseMinor(item.fixedAmountText) ?? undefined;
  else result.rentMultiple = item.rentMultipleText.trim();
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
