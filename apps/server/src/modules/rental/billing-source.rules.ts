import { createHash } from "node:crypto";

import type { RentalBillGenerationInput, RentalContractDepositTerm } from "@xpense/shared";

import type { BillingDraft, BillingSource, BillingTerms } from "./billing.types.js";

const billingRuleVersion = "rental-billing-v1";

/** 规范化输入对象键，排除调用方对象插入顺序的影响。 */
export function billingDigest(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    }
    return input;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function normalizedMultiple(value: string | null) {
  if (!value) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const tail = fraction.replace(/0+$/, "");
  return `${BigInt(whole)}${tail ? `.${tail}` : ""}`;
}

/** 数据库条目 UUID 与显示排序不是押金业务身份。 */
function depositIdentity(term: RentalContractDepositTerm) {
  return {
    type: term.type,
    customName: term.customName?.trim() ?? null,
    calculationMode: term.calculationMode,
    fixedAmountMinor: term.fixedAmountMinor,
    rentMultiple: normalizedMultiple(term.rentMultiple),
  };
}

/** 按业务内容和出现序号分配稳定键，保留每个独立押金项目。 */
export function buildDepositDrafts(
  terms: RentalContractDepositTerm[],
  dueDates: Record<string, string>,
): BillingDraft[] {
  const occurrences = new Map<string, number>();
  return terms.map((term) => {
    const identity = billingDigest(depositIdentity(term));
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    const sourceKey = `deposit:${identity}:${occurrence}`;
    const amountMinor = term.finalAmountMinor;
    if (amountMinor === null || !Number.isSafeInteger(amountMinor) || amountMinor <= 0)
      throw new RangeError("已确认押金金额必须是正安全整数");
    const label =
      term.customName ??
      { rental: "租赁押金", utility: "水电押金", access_card: "门禁押金", other: "其他押金" }[
        term.type
      ];
    return {
      type: "deposit",
      sourceKey,
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: dueDates[sourceKey] ?? null,
      amountMinor,
      depositSourceId: term.id,
      depositSnapshot: { ...term },
      lines: [
        {
          kind: "deposit",
          label,
          amountMinor,
          periodStart: null,
          periodEnd: null,
          referenceStart: null,
          referenceEnd: null,
          coveredDays: null,
          referenceDays: null,
          baseRentAmountMinor: null,
          sortOrder: 0,
        },
      ],
    };
  });
}

/** 将已确认或终止合同收敛为非空计费输入，草稿及取消合同不可生成。 */
export function billingTerms(source: BillingSource): BillingTerms {
  const contract = source.contract;
  if (contract.lifecycleStatus !== "confirmed" && contract.lifecycleStatus !== "terminated")
    throw new RangeError("草稿或已取消合同不能生成账单");
  if (
    !contract.startDate ||
    !contract.endDate ||
    contract.rentAmountMinor === null ||
    contract.billingAnchor === null ||
    contract.paymentIntervalMonths === null ||
    contract.dueDaysBefore === null
  )
    throw new RangeError("合同缺少已确认计费信息");
  return {
    startDate: contract.startDate,
    endDate: contract.endDate,
    rentAmountMinor: contract.rentAmountMinor,
    billingAnchor: contract.billingAnchor,
    paymentIntervalMonths: contract.paymentIntervalMonths,
    dueDaysBefore: contract.dueDaysBefore,
  };
}

/** 指纹覆盖计费、生命周期、有效账单和本次输入，不包含身份隐私及纯显示排序。 */
export function billingFingerprint(
  source: BillingSource,
  input: RentalBillGenerationInput,
): string {
  const contract = source.contract;
  return billingDigest({
    ruleVersion: billingRuleVersion,
    organizationId: source.organizationId,
    currencyCode: source.currencyCode,
    timezone: source.timezone,
    contractId: contract.id,
    lifecycleStatus: contract.lifecycleStatus,
    terms: {
      startDate: contract.startDate,
      endDate: contract.endDate,
      rentAmountMinor: contract.rentAmountMinor,
      billingAnchor: contract.billingAnchor,
      paymentIntervalMonths: contract.paymentIntervalMonths,
      dueDaysBefore: contract.dueDaysBefore,
    },
    terminationDate: contract.terminationDate,
    terminationRecordedAt: source.terminationRecordedAt,
    deposits: buildDepositDrafts(contract.depositTerms, {})
      .map((draft) => ({ sourceKey: draft.sourceKey, amountMinor: draft.amountMinor }))
      .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    propertyId: contract.propertyId,
    spaces: contract.spaces
      .map((space) => ({ spaceId: space.spaceId, rentAllocationMinor: space.rentAllocationMinor }))
      .sort((a, b) => a.spaceId.localeCompare(b.spaceId)),
    parties: contract.parties
      .map((party) => ({
        tenantId: party.tenantId,
        isPrimaryPayer: party.isPrimaryPayer,
        validFrom: party.validFrom,
        validTo: party.validTo,
      }))
      .sort((a, b) => a.tenantId.localeCompare(b.tenantId)),
    activeBills: source.activeBills
      .map((bill) => ({
        id: bill.id,
        sourceKey: bill.sourceKey,
        type: bill.type,
        amountMinor: bill.amountMinor,
        dueDate: bill.dueDate,
        effectiveEnd: bill.effectiveEnd,
        adjustmentId: bill.adjustmentId,
        lines: bill.lines,
      }))
      .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    adjustment: source.adjustment,
    input,
  });
}
