import type { PreviewRentalMonthlyBillRequest, RentalChargeTerms } from "@xpense/shared";
import { z } from "zod";
import { isCalendarDate } from "../contracts/contract-action-model";

export type MonthlyBillExtraFeeDraft = {
  id: string;
  name: string;
  amount: string;
  note: string;
};

export type MonthlyBillReadingDraft = {
  readingDate: string;
  reading: string;
};

export type MonthlyBillDraft = {
  billingMonth: string;
  dueDate: string;
  readings: {
    water: MonthlyBillReadingDraft;
    electricity: MonthlyBillReadingDraft;
  };
  extraFees: MonthlyBillExtraFeeDraft[];
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

export function createMonthlyBillDraftSchema(terms: MeterCollection) {
  return z
    .object({
      billingMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/, "请选择有效账单月份。")
        .refine((value) => isCalendarDate(`${value}-01`), "请选择有效账单月份。"),
      dueDate: z.string().refine(isCalendarDate, "请选择有效账单到期日。"),
      readings: z.object({
        water: z.object({ readingDate: z.string(), reading: z.string() }),
        electricity: z.object({ readingDate: z.string(), reading: z.string() }),
      }),
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
            if (!fee.note.trim())
              context.addIssue({
                code: "custom",
                path: [index, "note"],
                message: "请输入额外费用备注。",
              });
          });
        }),
    })
    .superRefine((value, context) => {
      for (const kind of ["water", "electricity"] as const) {
        if (!terms[`${kind}CollectionEnabled`]) continue;
        const reading = value.readings[kind];
        if (!reading.reading && !reading.readingDate) continue;
        if (!isCalendarDate(reading.readingDate))
          context.addIssue({
            code: "custom",
            path: ["readings", kind, "readingDate"],
            message: "请选择有效抄表日期。",
          });
        if (!isReading(reading.reading))
          context.addIssue({
            code: "custom",
            path: ["readings", kind, "reading"],
            message: `请输入最多四位小数的${kind === "water" ? "水表" : "电表"}读数。`,
          });
      }
    });
}
export const monthlyBillDraftSchema = createMonthlyBillDraftSchema({
  waterCollectionEnabled: true,
  electricityCollectionEnabled: true,
});

/** 只做字段完整性和十进制转换；正式账单金额完全来自服务端预览。 */
export function toMonthlyBillPreviewRequest(
  contractId: string,
  draft: MonthlyBillDraft,
  terms: MeterCollection,
): PreviewRentalMonthlyBillRequest | null {
  if (!createMonthlyBillDraftSchema(terms).safeParse(draft).success) return null;
  const readings = (["water", "electricity"] as const)
    .filter((kind) => terms[`${kind}CollectionEnabled`] && Boolean(draft.readings[kind].reading))
    .map((kind) => ({ kind, ...draft.readings[kind] }));

  const extraFees: PreviewRentalMonthlyBillRequest["extraFees"] = [];
  for (const fee of draft.extraFees) {
    const name = fee.name.trim();
    const amountText = fee.amount.trim();
    const note = fee.note.trim();
    if (!name && !amountText && !note) continue;
    const amountMinor = parseSignedMoneyMinor(amountText);
    if (!name || amountMinor === null || !note) return null;
    extraFees.push({ id: fee.id, name, amountMinor, note });
  }

  return {
    contractId,
    billingMonth: draft.billingMonth,
    dueDate: draft.dueDate,
    readings,
    extraFees,
  };
}
