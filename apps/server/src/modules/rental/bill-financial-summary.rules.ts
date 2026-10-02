import type { BillFinanceSummaryRow } from "./bills.repository.types.js";
import { calculateRentalCashBalance } from "./rental-cash.rules.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

const maximum = BigInt(Number.MAX_SAFE_INTEGER);

type RentalCashEntryFact = RentalCashProjectionFacts["cashEntries"][number];
type RentalBillFinancialTotals = {
  receivedMinor: number;
  refundedMinor: number;
  outstandingMinor: number;
  refundableMinor: number;
};

/** 汇总筛选中独立账单与真实关联结算的现金和差额，结算始终采用完整合同口径。 */
export function calculateBillFinancialTotals(
  matchingBills: readonly BillFinanceSummaryRow[],
  facts: readonly RentalCashProjectionFacts[],
  organizationId: string,
  today: string,
): RentalBillFinancialTotals | null {
  const factsByContract = new Map<string, RentalCashProjectionFacts>();
  const billsByContract = new Map<
    string,
    Map<string, RentalCashProjectionFacts["bills"][number]>
  >();
  const billCashByContract = new Map<string, Map<string, RentalCashEntryFact[]>>();
  const allCashIds = new Set<string>();

  for (const item of facts) {
    const contractBills = new Map<string, RentalCashProjectionFacts["bills"][number]>();
    const billCashEntries = new Map<string, RentalCashEntryFact[]>();
    for (const entry of item.cashEntries) {
      if (entry.contractId !== item.contractId || allCashIds.has(entry.id)) {
        throw new Error("Rental bill finance facts do not match the requested scope");
      }
      allCashIds.add(entry.id);
      if (entry.billId) {
        const entries = billCashEntries.get(entry.billId) ?? [];
        entries.push(entry);
        billCashEntries.set(entry.billId, entries);
      }
    }
    for (const bill of item.bills) {
      if (contractBills.has(bill.id)) throw new Error("Duplicate rental bill finance fact");
      contractBills.set(bill.id, bill);
    }
    if (item.organizationId !== organizationId || factsByContract.has(item.contractId)) {
      throw new Error("Rental bill finance facts do not match the requested scope");
    }
    factsByContract.set(item.contractId, item);
    billsByContract.set(item.contractId, contractBills);
    billCashByContract.set(item.contractId, billCashEntries);
  }

  let received = 0n;
  let refunded = 0n;
  let outstanding = 0n;
  let refundable = 0n;
  const selectedCashById = new Map<string, RentalCashEntryFact>();
  const selectedSettlementByContract = new Map<string, RentalCashProjectionFacts>();
  const matchedBillIdsByContract = new Map<string, Set<string>>();
  let hasFinancialBills = false;

  for (const row of matchingBills) {
    if (row.modelVersion === 1) continue;
    if (row.modelVersion !== 2) throw new Error("Unsupported rental bill model version");
    hasFinancialBills = true;

    const contractFacts = factsByContract.get(row.contractId);
    if (!contractFacts) throw new Error("Rental bill finance facts could not be loaded");
    const matchingBillIds = matchedBillIdsByContract.get(row.contractId) ?? new Set<string>();
    if (matchingBillIds.has(row.id)) throw new Error("Duplicate rental bill finance identity");
    matchingBillIds.add(row.id);
    matchedBillIdsByContract.set(row.contractId, matchingBillIds);

    const bill = billsByContract.get(row.contractId)?.get(row.id);
    if (bill?.modelVersion !== row.modelVersion) {
      throw new Error("Rental bill finance facts could not be loaded");
    }

    const isSettlementBill = contractFacts.settlementBillIds.includes(row.id);
    if (isSettlementBill) {
      if (!contractFacts.settlement) {
        throw new Error("Linked rental settlement finance facts could not be loaded");
      }
      selectedSettlementByContract.set(row.contractId, contractFacts);
      continue;
    }

    const billCashEntries = billCashByContract.get(row.contractId)?.get(row.id) ?? [];
    const balance = calculateRentalCashBalance(
      billCashEntries,
      { kind: "bill", billId: row.id },
      bill.status === "voided" ? 0 : bill.amountMinor,
      bill.dueDate,
      today,
    );
    outstanding += BigInt(balance.outstandingMinor);
    refundable += BigInt(balance.refundableMinor);
    for (const entry of billCashEntries) addSelectedCash(selectedCashById, entry);
  }

  for (const contractFacts of selectedSettlementByContract.values()) {
    const settlement = contractFacts.settlement;
    if (!settlement) throw new Error("Linked rental settlement finance facts could not be loaded");
    const balance = calculateRentalCashBalance(
      contractFacts.cashEntries,
      { kind: "settlement", settlementId: settlement.id },
      settlement.finalCostMinor,
      settlement.effectiveEndDate,
      today,
    );
    outstanding += BigInt(balance.outstandingMinor);
    refundable += BigInt(balance.refundableMinor);
    for (const entry of contractFacts.cashEntries) addSelectedCash(selectedCashById, entry);
  }

  for (const entry of selectedCashById.values()) {
    if (entry.kind !== "receipt" && entry.kind !== "refund") {
      throw new Error("Unsupported rental cash entry kind");
    }
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      throw new RangeError("有效收退款必须为正安全整数");
    }
    if (entry.kind === "receipt") received += BigInt(entry.amountMinor);
    else refunded += BigInt(entry.amountMinor);
  }

  if (!hasFinancialBills) return null;
  if ([received, refunded, outstanding, refundable].some((amount) => amount > maximum)) {
    throw new RangeError("财务余额合计超出安全整数范围");
  }
  return {
    receivedMinor: Number(received),
    refundedMinor: Number(refunded),
    outstandingMinor: Number(outstanding),
    refundableMinor: Number(refundable),
  };
}

function addSelectedCash(
  selectedCashById: Map<string, RentalCashEntryFact>,
  entry: RentalCashEntryFact,
): void {
  if (entry.revokedAt === null) selectedCashById.set(entry.id, entry);
}
