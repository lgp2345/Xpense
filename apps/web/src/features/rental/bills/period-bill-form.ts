import type { PreviewRentalPeriodBillRequest, RentalChargeTerms } from "@xpense/shared";
import { z } from "zod";
import { isCalendarDate } from "../contracts/contract-action-model";

export type PeriodBillExtraFeeDraft = {
  id: string;
  name: string;
  amount: string;
  note: string;
};

export type PeriodBillReadingDraft = {
  reading: string;
};

export type PeriodBillDraft = {
  periodStart: string;
  dueDate: string;
  readings: {
    water: PeriodBillReadingDraft;
    electricity: PeriodBillReadingDraft;
  };
  extraFees: PeriodBillExtraFeeDraft[];
  baselineReadings: PeriodBillDraft["readings"];
  overrideWaterUnitPrice: string;
  overrideElectricityUnitPrice: string;
  overrideFixedFees: Array<{ id: string; amount: string }>;
  overrideReason: string;
};

/** 解析含正负号的两位小数金额，不经过二进制浮点。 */
export function parseSignedMoneyMinor(value: string): number | null {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = BigInt(match[2] ?? "0");
  const fraction = BigInt((match[3] ?? "").padEnd(2, "0"));
  const unsigned = whole * 100n + fraction;
  const signed = match[1] === "-" ? -unsigned : unsigned;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    return null;
  }
  return Number(signed);
}

function isReading(value: string): boolean {
  return /^\d+(?:\.\d{1,4})?$/.test(value.trim());
}

export type MeterCollection = Pick<
  RentalChargeTerms,
  "waterCollectionEnabled" | "electricityCollectionEnabled"
>;
type PeriodBillTerms = MeterCollection &
  Partial<Pick<RentalChargeTerms, "waterUnitPrice" | "electricityUnitPrice" | "fixedFees">>;

function normalizedPrice(value: string): string {
  const [whole = "", fraction = ""] = value.trim().split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "")}`;
}

/** 只提交与合同默认值不同的单价和固定费，等价小数不视为改价。 */
function changedCharges(draft: PeriodBillDraft, terms: PeriodBillTerms) {
  const water = draft.overrideWaterUnitPrice.trim();
  const electricity = draft.overrideElectricityUnitPrice.trim();
  const fixedFees = draft.overrideFixedFees.flatMap((fee) => {
    const amount = parseSignedMoneyMinor(fee.amount);
    const original = terms.fixedFees?.find((item) => item.id === fee.id);
    return amount !== null && amount !== original?.periodAmountMinor
      ? [{ id: fee.id, periodAmountMinor: amount }]
      : [];
  });
  const waterChanged =
    terms.waterCollectionEnabled &&
    water &&
    normalizedPrice(water) !== normalizedPrice(terms.waterUnitPrice ?? "");
  const electricityChanged =
    terms.electricityCollectionEnabled &&
    electricity &&
    normalizedPrice(electricity) !== normalizedPrice(terms.electricityUnitPrice ?? "");
  return {
    ...(waterChanged ? { waterUnitPrice: water } : {}),
    ...(electricityChanged ? { electricityUnitPrice: electricity } : {}),
    fixedFees,
  };
}

export function createPeriodBillDraftSchema(terms: PeriodBillTerms, continuation = false) {
  return z
    .object({
      periodStart: z.string().refine(isCalendarDate, "请选择有效账期。"),
      dueDate: z.string().refine(isCalendarDate, "请选择有效账单到期日。"),
      readings: z.object({
        water: z.object({ reading: z.string() }),
        electricity: z.object({ reading: z.string() }),
      }),
      baselineReadings: z.object({
        water: z.object({ reading: z.string() }),
        electricity: z.object({ reading: z.string() }),
      }),
      overrideWaterUnitPrice: z
        .string()
        .refine((value) => !value || isReading(value), "请输入最多四位小数的单价。"),
      overrideElectricityUnitPrice: z
        .string()
        .refine((value) => !value || isReading(value), "请输入最多四位小数的单价。"),
      overrideFixedFees: z.array(
        z.object({
          id: z.string(),
          amount: z.string().refine((value) => {
            const amount = parseSignedMoneyMinor(value);
            return amount !== null && amount >= 0;
          }, "请输入非负每期金额。"),
        }),
      ),
      overrideReason: z.string().max(1000, "备注最多1000字。"),
      extraFees: z
        .array(
          z.object({
            id: z.string().min(1),
            name: z.string(),
            amount: z.string(),
            note: z.string(),
          }),
        )
        .superRefine((fees, context) => {
          fees.forEach((fee, index) => {
            if (!fee.name.trim() && !fee.amount.trim() && !fee.note.trim()) return;
            if (!fee.name.trim())
              context.addIssue({
                code: "custom",
                path: [index, "name"],
                message: "请输入额外费用名称。",
              });
            if (parseSignedMoneyMinor(fee.amount) === null)
              context.addIssue({
                code: "custom",
                path: [index, "amount"],
                message: "请输入有效费用金额。",
              });
            if (fee.note.length > 1000)
              context.addIssue({
                code: "custom",
                path: [index, "note"],
                message: "备注最多1000字。",
              });
          });
        }),
    })
    .superRefine((value, context) => {
      const changes = changedCharges(value, terms);
      if (
        (changes.waterUnitPrice || changes.electricityUnitPrice || changes.fixedFees.length) &&
        !value.overrideReason.trim()
      )
        context.addIssue({
          code: "custom",
          path: ["overrideReason"],
          message: "调整本期金额或单价时，请在备注中说明原因。",
        });
      for (const kind of ["water", "electricity"] as const) {
        if (!terms[`${kind}CollectionEnabled`]) continue;
        const priceKey =
          kind === "water" ? "overrideWaterUnitPrice" : "overrideElectricityUnitPrice";
        if (!value[priceKey].trim())
          context.addIssue({ code: "custom", path: [priceKey], message: "请输入本期单价。" });
        if (continuation) {
          const baseline = value.baselineReadings[kind];
          if (!isReading(baseline.reading))
            context.addIssue({
              code: "custom",
              path: ["baselineReadings", kind, "reading"],
              message: "请输入接续起算读数。",
            });
        }
        const reading = value.readings[kind];
        if (!reading.reading) continue;
        if (!isReading(reading.reading))
          context.addIssue({
            code: "custom",
            path: ["readings", kind, "reading"],
            message: `请输入最多四位小数的${kind === "water" ? "水表" : "电表"}读数。`,
          });
      }
    });
}
export const periodBillDraftSchema = createPeriodBillDraftSchema({
  waterCollectionEnabled: true,
  electricityCollectionEnabled: true,
});

/** 只做字段完整性和十进制转换；正式账单金额完全来自服务端预览。 */
export function toPeriodBillPreviewRequest(
  contractId: string,
  draft: PeriodBillDraft,
  terms: PeriodBillTerms,
  continuation = false,
): PreviewRentalPeriodBillRequest | null {
  if (!createPeriodBillDraftSchema(terms, continuation).safeParse(draft).success) return null;
  const readings = (["water", "electricity"] as const)
    .filter((kind) => terms[`${kind}CollectionEnabled`] && Boolean(draft.readings[kind].reading))
    .map((kind) => ({ kind, ...draft.readings[kind] }));

  const extraFees: PreviewRentalPeriodBillRequest["extraFees"] = [];
  for (const fee of draft.extraFees) {
    const name = fee.name.trim();
    const amountText = fee.amount.trim();
    const note = fee.note.trim();
    if (!name && !amountText && !note) continue;
    const amountMinor = parseSignedMoneyMinor(amountText);
    if (!name || amountMinor === null) return null;
    extraFees.push({ id: fee.id, name, amountMinor, note });
  }

  const changes = changedCharges(draft, terms);
  const note = draft.overrideReason.trim();
  return {
    contractId,
    periodStart: draft.periodStart,
    dueDate: draft.dueDate,
    readings,
    extraFees,
    ...(note ? { note } : {}),
    ...(changes.waterUnitPrice || changes.electricityUnitPrice || changes.fixedFees.length
      ? {
          overrides: {
            ...changes,
            reason: note,
          },
        }
      : {}),
  };
}

export function createPeriodBillDraft(
  context: import("@xpense/shared").RentalPeriodBillContext,
): PeriodBillDraft {
  const empty = {
    water: { reading: "" },
    electricity: { reading: "" },
  };
  const readings = structuredClone(empty);
  for (const item of context.defaultReadings) readings[item.kind] = { reading: item.reading };
  return {
    periodStart: context.nextPeriod?.periodStart ?? "",
    dueDate: context.defaultDueDate ?? "",
    readings,
    baselineReadings: {
      water: { reading: "" },
      electricity: { reading: "" },
    },
    extraFees: [],
    overrideWaterUnitPrice: context.defaults.waterUnitPrice,
    overrideElectricityUnitPrice: context.defaults.electricityUnitPrice,
    overrideFixedFees: context.defaults.fixedFees.map((fee) => {
      const amount = BigInt(fee.periodAmountMinor);
      return { id: fee.id, amount: `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}` };
    }),
    overrideReason: "",
  };
}
export function periodMissingFieldLabel(field: string): string {
  return (
    (
      {
        waterBaseline: "水表起算基准",
        electricityBaseline: "电表起算基准",
        waterReading: "本期水表读数",
        electricityReading: "本期电表读数",
        chargeTerms: "合同收费设置",
      } as Record<string, string>
    )[field] ?? field
  );
}
