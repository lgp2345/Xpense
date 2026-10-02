import type {
  RentalBillDetail,
  RentalBillRevisionInput,
  RentalFeeSnapshot,
  RentalFixedFeeAdjustment,
  RentalMeterKind,
  RentalMonthlyChargeOverrides,
} from "@xpense/shared";
import { z } from "zod";
import { isCalendarDate } from "../contracts/contract-action-model";
import { type MonthlyBillExtraFeeDraft, parseSignedMoneyMinor } from "./monthly-bill-form";

export type BillRevisionMeterDraft = {
  snapshotKey: string;
  kind: RentalMeterKind;
  startReading: string;
  endReading: string;
  endDate: string;
  unitPrice: string;
};
export type BillRevisionValues = {
  meters: BillRevisionMeterDraft[];
  fixedFees: { id: string; name: string; amount: string }[];
  extraFees: (MonthlyBillExtraFeeDraft & { origin: "monthly" | "settlement" })[];
  reason: string;
};
type MeterSnapshot = Extract<RentalFeeSnapshot, { kind: RentalMeterKind }>;

export function billRevisionMeterKey(saved: MeterSnapshot): string {
  return `${saved.kind}:${saved.startReadingId}:${saved.endReadingId}`;
}

function readingEdits(bill: RentalBillDetail, values: BillRevisionValues) {
  const snapshots = new Map(
    billRevisionMeterSnapshots(bill).map((saved) => [billRevisionMeterKey(saved), saved]),
  );
  return values.meters.flatMap((meter, index) => {
    const saved = snapshots.get(meter.snapshotKey);
    if (!saved) return [];
    const edits = [];
    if (decimal4(meter.startReading) !== decimal4(saved.startReading)) {
      edits.push({
        index,
        field: "startReading",
        id: saved.startReadingId,
        kind: meter.kind,
        readingDate: saved.startDate,
        reading: meter.startReading.trim(),
      });
    }
    if (
      decimal4(meter.endReading) !== decimal4(saved.endReading) ||
      meter.endDate !== saved.endDate
    ) {
      edits.push({
        index,
        field: "endReading",
        id: saved.endReadingId,
        kind: meter.kind,
        readingDate: meter.endDate,
        reading: meter.endReading.trim(),
      });
    }
    return edits;
  });
}

/** 与数据库 decimal(20,4) 一致，仅用于输入验证和识别等值编辑。 */
function decimal4(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!match) return null;
  const amount = BigInt(match[1] ?? "0") * 10000n + BigInt((match[2] ?? "").padEnd(4, "0"));
  return amount <= 99999999999999999999n ? amount : null;
}
function moneyText(value: number): string {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  const fraction = String(absolute % 100n)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return `${amount < 0n ? "-" : ""}${absolute / 100n}${fraction ? `.${fraction}` : ""}`;
}
export function billRevisionMeterSnapshots(bill: RentalBillDetail): MeterSnapshot[] {
  return bill.lines.flatMap((line) => {
    const saved = line.feeSnapshot;
    return saved?.kind === "water" || saved?.kind === "electricity" ? [saved] : [];
  });
}

/** 从账单保存的历史快照初始化；不读取合同当前收费标准。 */
export function initialBillRevisionValues(bill: RentalBillDetail): BillRevisionValues {
  return {
    meters: billRevisionMeterSnapshots(bill).map((saved) => ({
      snapshotKey: billRevisionMeterKey(saved),
      kind: saved.kind,
      startReading: saved.startReading,
      endReading: saved.endReading,
      endDate: saved.endDate,
      unitPrice: saved.unitPrice,
    })),
    fixedFees: bill.lines.flatMap((line) =>
      line.feeSnapshot?.kind === "fixed_fee"
        ? [
            {
              id: line.feeSnapshot.feeId,
              name: line.label,
              amount: moneyText(line.amountMinor),
            },
          ]
        : [],
    ),
    extraFees: bill.lines.flatMap((line) => {
      if (line.kind !== "extra_fee") return [];
      const saved = line.feeSnapshot?.kind === "extra_fee" ? line.feeSnapshot : null;
      return [
        {
          id: saved?.extraFeeId ?? crypto.randomUUID(),
          name: line.label,
          amount: moneyText(line.amountMinor),
          note: line.note ?? "",
          origin: saved?.origin ?? "monthly",
        },
      ];
    }),
    reason: "",
  };
}

export function billRevisionFormSchema(bill: RentalBillDetail) {
  const savedMeters = billRevisionMeterSnapshots(bill);
  const decimal = (message: string) =>
    z.string().refine((value) => decimal4(value) !== null, message);
  return z
    .object({
      meters: z.array(
        z.object({
          kind: z.enum(["water", "electricity"]),
          snapshotKey: z.string(),
          startReading: decimal("请输入非负读数，最多四位小数。"),
          endReading: decimal("请输入非负读数，最多四位小数。"),
          endDate: z.string().refine(isCalendarDate, "请选择有效抄表日期。"),
          unitPrice: decimal("请输入非负单价，最多四位小数。"),
        }),
      ),
      fixedFees: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          amount: z.string().refine((value) => {
            const amount = parseSignedMoneyMinor(value);
            return amount !== null && amount >= 0;
          }, "请输入非负固定月费，最多两位小数。"),
        }),
      ),
      extraFees: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1, "请输入额外费用名称。"),
          amount: z
            .string()
            .refine((value) => parseSignedMoneyMinor(value) !== null, "请输入有效费用金额。"),
          note: z.string().trim().min(1, "请输入额外费用备注。"),
          origin: z.enum(["monthly", "settlement"]),
        }),
      ),
      reason: z.string().trim().min(1, "请输入账单更正原因。"),
    })
    .superRefine((values, context) => {
      values.meters.forEach((meter, index) => {
        const saved = savedMeters.find(
          (snapshot) => billRevisionMeterKey(snapshot) === meter.snapshotKey,
        );
        if (!saved) return;
        if (isCalendarDate(meter.endDate) && meter.endDate <= saved.startDate) {
          context.addIssue({
            code: "custom",
            path: ["meters", index, "endDate"],
            message: "本次抄表日期须晚于上次抄表日期。",
          });
        }
        const sameKind = values.meters.filter((item) => item.kind === meter.kind);
        if (sameKind.length > 1 && meter.endDate !== saved.endDate) {
          context.addIssue({
            code: "custom",
            path: ["meters", index, "endDate"],
            message: "同种表计有多段计量时，请按原日期更正读数。",
          });
        }
        if (
          decimal4(meter.unitPrice) !== decimal4(saved.unitPrice) &&
          sameKind.some((item) => decimal4(item.unitPrice) !== decimal4(meter.unitPrice))
        ) {
          context.addIssue({
            code: "custom",
            path: ["meters", index, "unitPrice"],
            message: "更正单价会统一本账单该表计全部区间，请使用相同单价。",
          });
        }
      });
      const edits = readingEdits(bill, values);
      for (const edit of edits) {
        const sameKind = edits.filter((item) => item.kind === edit.kind);
        if (
          sameKind.some(
            (item) =>
              item.id !== edit.id ||
              item.readingDate !== edit.readingDate ||
              decimal4(item.reading) !== decimal4(edit.reading),
          )
        ) {
          context.addIssue({
            code: "custom",
            path: ["meters", edit.index, edit.field],
            message: "每种表计一次只能更正一个真实边界，请分次确认。",
          });
        }
      }
    });
}

export function billRevisionErrors(bill: RentalBillDetail, values: BillRevisionValues) {
  const parsed = billRevisionFormSchema(bill).safeParse(values);
  return new Map(
    parsed.success ? [] : parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

/** 只提交明确改变的读数和价格；应收差额、相邻账单与结算金额由服务端决定。 */
export function toBillRevisionInput(
  bill: RentalBillDetail,
  values: BillRevisionValues,
  intent: "fees" | "readings" = "readings",
): Omit<RentalBillRevisionInput, "idempotencyKey"> | null {
  if (!bill.financial || !billRevisionFormSchema(bill).safeParse(values).success) return null;
  const reason = values.reason.trim();
  const readings = [
    ...new Map(
      readingEdits(bill, values).map((edit) => [
        edit.id,
        { kind: edit.kind, readingDate: edit.readingDate, reading: edit.reading },
      ]),
    ).values(),
  ];
  const overrides: RentalMonthlyChargeOverrides = { reason };
  for (const meter of values.meters) {
    const saved = billRevisionMeterSnapshots(bill).find(
      (snapshot) => billRevisionMeterKey(snapshot) === meter.snapshotKey,
    );
    if (!saved) continue;
    if (decimal4(meter.unitPrice) !== decimal4(saved.unitPrice)) {
      if (meter.kind === "water") overrides.waterUnitPrice = meter.unitPrice.trim();
      else overrides.electricityUnitPrice = meter.unitPrice.trim();
    }
  }
  const fixedFeeAdjustments: RentalFixedFeeAdjustment[] = [];
  for (const line of bill.lines) {
    if (line.feeSnapshot?.kind !== "fixed_fee") continue;
    const feeId = line.feeSnapshot.feeId;
    const fee = values.fixedFees.find((current) => current.id === feeId);
    if (!fee) fixedFeeAdjustments.push({ feeId, action: "remove" });
    else {
      const amountMinor = parseSignedMoneyMinor(fee.amount);
      if (amountMinor !== null && amountMinor !== line.amountMinor)
        fixedFeeAdjustments.push({ feeId, action: "set_amount", amountMinor });
    }
  }
  return {
    billId: bill.id,
    mode: intent === "fees" && bill.financial.receivedMinor === 0 ? "edit_unpaid" : "correction",
    expectedVersion: bill.financial.version,
    reason,
    ...(intent === "readings" && readings.length ? { readings } : {}),
    ...(fixedFeeAdjustments.length ? { fixedFeeAdjustments } : {}),
    ...(Object.keys(overrides).length > 1 ? { overrides } : {}),
    extraFees: values.extraFees.map((fee) => ({
      id: fee.id,
      name: fee.name.trim(),
      amountMinor: parseSignedMoneyMinor(fee.amount) as number,
      note: fee.note.trim(),
    })),
  };
}
