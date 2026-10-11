import type {
  RentalBillLine,
  RentalChargeTerms,
  RentalExtraFeeInput,
  RentalMeterKind,
  RentalPeriodChargeOverrides,
} from "@xpense/shared";
import type { BillingRentDraft } from "./billing.types.js";
import { calculateMeterCharge } from "./rental-decimal.rules.js";
import type { RentalMeterReading } from "./rental-finance.types.js";

export type PeriodChargeInput = {
  rent: BillingRentDraft;
  chargeTerms: RentalChargeTerms;
  readings: Record<
    RentalMeterKind,
    { previous: RentalMeterReading; current: RentalMeterReading } | null
  >;
  extraFees: RentalExtraFeeInput[];
  overrides?: RentalPeriodChargeOverrides;
};
export function chargeLine(
  fields: Partial<RentalBillLine> & Pick<RentalBillLine, "kind" | "label" | "amountMinor">,
): RentalBillLine {
  return {
    periodStart: null,
    periodEnd: null,
    referenceStart: null,
    referenceEnd: null,
    coveredDays: null,
    referenceDays: null,
    baseRentAmountMinor: null,
    sortOrder: 0,
    ...fields,
  };
}
/** 前驱按有效账单决定，保留整数金额和四位小数快照。 */
export function periodMeterLine(
  kind: RentalMeterKind,
  interval: { previous: RentalMeterReading; current: RentalMeterReading },
  unitPrice: string,
  overrideReason: string | null,
): RentalBillLine {
  const { previous, current } = interval;
  if (
    previous.kind !== kind ||
    current.kind !== kind ||
    previous.contractId !== current.contractId ||
    previous.spaceId !== current.spaceId ||
    current.predecessorId !== previous.id ||
    previous.id === current.id
  )
    throw new RangeError("水电计费读数边界无效");
  return chargeLine({
    kind,
    label: kind === "water" ? "水费" : "电费",
    amountMinor: calculateMeterCharge(previous.reading, current.reading, unitPrice),
    feeSnapshot: {
      kind,
      startReadingId: previous.id,
      endReadingId: current.id,
      startReading: previous.reading,
      endReading: current.reading,
      unitPrice,
      overrideReason,
    },
  });
}
export function safePeriodTotal(lines: RentalBillLine[]): number {
  const total = lines.reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
  if (total < 0n || total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("账期应收合计超出非负安全整数范围");
  return Number(total);
}
/** 房租沿用月片段，每期固定费用不乘付款周期、不折算不足期。 */
export function calculatePeriodCharges(input: PeriodChargeInput): {
  lines: RentalBillLine[];
  amountMinor: number;
} {
  const lines: RentalBillLine[] = [...input.rent.lines];
  const { chargeTerms: terms, overrides } = input;
  if (overrides && !overrides.reason.trim()) throw new RangeError("价格覆盖必须填写原因");
  for (const kind of ["water", "electricity"] as const) {
    if (!terms[`${kind}CollectionEnabled`]) continue;
    const interval = input.readings[kind];
    if (!interval) continue;
    const price = overrides?.[`${kind}UnitPrice`];
    lines.push(
      periodMeterLine(
        kind,
        interval,
        price ?? terms[`${kind}UnitPrice`],
        price === undefined ? null : (overrides?.reason ?? null),
      ),
    );
  }
  const fees = new Map((overrides?.fixedFees ?? []).map((fee) => [fee.id, fee.periodAmountMinor]));
  if ([...fees.keys()].some((id) => !terms.fixedFees.some((fee) => fee.id === id)))
    throw new RangeError("覆盖固定费不存在");
  for (const fee of terms.fixedFees) {
    const amount = fees.get(fee.id) ?? fee.periodAmountMinor;
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new RangeError("每期固定费必须为非负安全整数");
    lines.push(
      chargeLine({
        kind: "fixed_fee",
        label: fee.name,
        amountMinor: amount,
        periodStart: input.rent.periodStart,
        periodEnd: input.rent.periodEnd,
        feeSnapshot: {
          kind: "fixed_fee",
          feeId: fee.id,
          periodAmountMinor: amount,
          calculationMode: "full_period",
          overrideReason: fees.has(fee.id) ? (overrides?.reason ?? null) : null,
        },
      }),
    );
  }
  if (new Set(input.extraFees.map((fee) => fee.id)).size !== input.extraFees.length)
    throw new RangeError("额外费用标识重复");
  for (const fee of input.extraFees) {
    if (!Number.isSafeInteger(fee.amountMinor)) throw new RangeError("额外费用必须是安全整数");
    lines.push(
      chargeLine({
        kind: "extra_fee",
        label: fee.name,
        amountMinor: fee.amountMinor,
        note: fee.note,
        feeSnapshot: { kind: "extra_fee", extraFeeId: fee.id, origin: "period" },
      }),
    );
  }
  const ordered = lines.map((line, sortOrder) => ({ ...line, sortOrder }));
  return { lines: ordered, amountMinor: safePeriodTotal(ordered) };
}
