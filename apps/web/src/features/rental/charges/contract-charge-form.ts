import {
  duplicateRentalItemNameIndexes,
  type RentalChargeTerms,
  type RentalContractChargeSetup,
  type RentalMeterReadingInput,
} from "@xpense/shared";
import { z } from "zod";

export type ContractChargeFormValues = {
  waterCollectionEnabled: boolean;
  electricityCollectionEnabled: boolean;
  waterUnitPrice: string;
  electricityUnitPrice: string;
  waterReading: string;
  waterReadingDate: string;
  electricityReading: string;
  electricityReadingDate: string;
  fixedFees: { id: string; name: string; amount: string; nameLocked?: boolean }[];
};

export function parseFixedFeeAmount(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount = BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

export function fixedFeeAmountText(amount: number): string {
  return `${BigInt(amount) / 100n}.${String(BigInt(amount) % 100n).padStart(2, "0")}`;
}

const decimal = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    year > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 单价启用时必填，底数和日期成对可选，所有金额使用精确整数转换。 */
export const contractChargeFormSchema = z
  .object({
    waterCollectionEnabled: z.boolean(),
    electricityCollectionEnabled: z.boolean(),
    waterUnitPrice: z.string(),
    electricityUnitPrice: z.string(),
    waterReading: z.string(),
    waterReadingDate: z.string(),
    electricityReading: z.string(),
    electricityReadingDate: z.string(),
    fixedFees: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1, "请输入事项名称").max(100),
        amount: z
          .string()
          .refine(
            (value) => parseFixedFeeAmount(value) !== null,
            "请输入非负且最多两位小数的月费金额",
          ),
      }),
    ),
  })
  .superRefine((value, context) => {
    for (const kind of ["water", "electricity"] as const) {
      if (!value[`${kind}CollectionEnabled`]) continue;
      if (!decimal.test(value[`${kind}UnitPrice`].trim()))
        context.addIssue({
          code: "custom",
          path: [`${kind}UnitPrice`],
          message: "请输入最多四位小数的非负单价",
        });
      const reading = value[`${kind}Reading`].trim();
      const date = value[`${kind}ReadingDate`];
      if (reading && !decimal.test(reading))
        context.addIssue({
          code: "custom",
          path: [`${kind}Reading`],
          message: "请输入最多四位小数的非负底数",
        });
      if (Boolean(reading) !== Boolean(date) || (date && !calendarDate(date)))
        context.addIssue({
          code: "custom",
          path: [`${kind}ReadingDate`],
          message: "入住底数和有效抄表日期必须同时填写",
        });
    }
    if (new Set(value.fixedFees.map(({ id }) => id)).size !== value.fixedFees.length)
      context.addIssue({ code: "custom", path: ["fixedFees"], message: "事项不能重复" });
    for (const index of duplicateRentalItemNameIndexes(value.fixedFees.map(({ name }) => name)))
      context.addIssue({
        code: "custom",
        path: ["fixedFees", index, "name"],
        message: "固定收费事项名称不能重复",
      });
  });

export function defaultContractChargeValues(): ContractChargeFormValues {
  return {
    waterCollectionEnabled: true,
    electricityCollectionEnabled: true,
    waterUnitPrice: "",
    electricityUnitPrice: "",
    waterReading: "",
    waterReadingDate: "",
    electricityReading: "",
    electricityReadingDate: "",
    fixedFees: [],
  };
}

export function toContractChargeSetup(values: ContractChargeFormValues): RentalContractChargeSetup {
  const value = contractChargeFormSchema.parse(values);
  const baselineReadings: RentalMeterReadingInput[] = [];
  for (const kind of ["water", "electricity"] as const) {
    if (value[`${kind}CollectionEnabled`] && value[`${kind}Reading`].trim())
      baselineReadings.push({
        kind,
        reading: value[`${kind}Reading`].trim(),
        readingDate: value[`${kind}ReadingDate`],
      });
  }
  return {
    chargeTerms: {
      waterCollectionEnabled: value.waterCollectionEnabled,
      electricityCollectionEnabled: value.electricityCollectionEnabled,
      waterUnitPrice: value.waterCollectionEnabled ? value.waterUnitPrice.trim() : "0.0000",
      electricityUnitPrice: value.electricityCollectionEnabled
        ? value.electricityUnitPrice.trim()
        : "0.0000",
      fixedFees: value.fixedFees.map(({ id, name, amount }) => ({
        id,
        name: name.trim(),
        monthlyAmountMinor: parseFixedFeeAmount(amount) as number,
      })),
    },
    baselineReadings,
  };
}

export function toContractChargeValues(
  terms: RentalChargeTerms,
  readings: RentalMeterReadingInput[] = [],
): ContractChargeFormValues {
  const value = {
    ...defaultContractChargeValues(),
    ...terms,
    fixedFees: terms.fixedFees.map((fee) => ({
      id: fee.id,
      name: fee.name,
      amount: fixedFeeAmountText(fee.monthlyAmountMinor),
    })),
  };
  for (const reading of readings) {
    value[`${reading.kind}Reading`] = reading.reading;
    value[`${reading.kind}ReadingDate`] = reading.readingDate;
  }
  return value;
}
