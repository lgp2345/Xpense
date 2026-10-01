import { Injectable } from "@nestjs/common";
import type { RentalSettlementDetail } from "@xpense/shared";

import type { AppDbExecutor } from "../../db/db.module.js";
import { parseCalendarDate } from "./contract-date.rules.js";
import { calculateRentalBalance } from "./rental-balance.rules.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";
import type {
  FinanceScope,
  RentalFinanceSnapshot,
  SettlementPlan,
} from "./rental-finance.types.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";

const maximum = BigInt(Number.MAX_SAFE_INTEGER);

/** 将结算按当前关联账单修订与合同有效资金刷新为原子投影。 */
@Injectable()
export class SettlementProjectionService {
  constructor(
    private readonly sources: RentalFinanceSourceService,
    private readonly projectionSources: RentalCashProjectionRepository,
    private readonly settlements: RentalSettlementsRepository,
  ) {}

  async refresh(
    scope: FinanceScope,
    actor: string,
    executor: AppDbExecutor,
  ): Promise<RentalSettlementDetail | null> {
    const current = await this.settlements.findCurrent(scope, executor);
    if (!current) return null;

    const [source, currentFacts] = await Promise.all([
      this.sources.read(scope, executor),
      this.readFacts(scope, executor),
    ]);
    if (currentFacts.settlement?.id !== current.id)
      throw new Error("Rental settlement changed during projection refresh");
    const linkedBillIds = currentFacts.settlementBillIds;
    const linked = new Set(linkedBillIds);
    const billsById = new Map(source.bills.map((bill) => [bill.id, bill]));
    const finalBills = linkedBillIds
      .map((billId) => {
        const bill = billsById.get(billId);
        if (!bill) throw new Error("Settlement bill link has no current scoped bill");
        if (bill.status !== "active" || bill.type === "deposit") return null;
        const lines = bill.lines.filter((line) => line.kind !== "deposit");
        const amountMinor = sumSignedSafe(
          lines.map((line) => line.amountMinor),
          "已关联结算账单金额",
        );
        if (amountMinor < 0) throw new RangeError("结算账单应收金额不能为负数");
        const billingMonth = bill.billingMonth ?? bill.periodStart?.slice(0, 7) ?? null;
        if (!billingMonth) throw new RangeError("已关联结算账单缺少稳定账期");
        parseCalendarDate(`${billingMonth}-01`);
        return {
          billId: bill.id,
          billingMonth,
          lines,
          amountMinor,
        };
      })
      .filter((bill): bill is NonNullable<typeof bill> => bill !== null)
      .sort(
        (left, right) =>
          left.billingMonth.localeCompare(right.billingMonth) ||
          (left.billId ?? "").localeCompare(right.billId ?? ""),
      );
    if (linkedBillIds.length !== linked.size) throw new Error("Duplicate settlement bill link");
    const currentLinked = source.bills.filter((bill) => linked.has(bill.id));
    if (currentLinked.length !== linked.size)
      throw new Error("Settlement bill links do not match current scoped bills");

    const finalCostMinor = sumSafe(
      finalBills.map((bill) => bill.amountMinor),
      "结算最终金额",
    );
    const { receivedMinor, refundedMinor } = cashTotals(source);
    const difference = BigInt(finalCostMinor) - (BigInt(receivedMinor) - BigInt(refundedMinor));
    if (difference < -maximum || difference > maximum)
      throw new RangeError("结算差额超出安全整数范围");
    const plan: SettlementPlan = {
      effectiveEndDate: current.effectiveEndDate,
      withdrawnBillIds: current.snapshot.withdrawnBillIds ?? [],
      finalBills,
      finalCostMinor,
      differenceMinor: Number(difference),
    };
    const balance = calculateRentalBalance(
      finalCostMinor,
      receivedMinor,
      refundedMinor,
      null,
      source.context.today,
    );
    const status =
      balance.refundableMinor > 0
        ? "pending_refund"
        : balance.outstandingMinor > 0
          ? "pending_collection"
          : "settled";
    const nextFacts: RentalCashProjectionFacts = {
      ...currentFacts,
      settlement: {
        ...currentFacts.settlement,
        revision: current.revision + 1,
        finalCostMinor,
        status,
      },
    };
    const version = rentalCashSourceVersion(nextFacts, {
      kind: "settlement",
      settlementId: current.id,
    });
    const saved = await this.settlements.revise(
      scope,
      current.id,
      { plan, status, version, reason: "同步结算关联账单与资金" },
      { userId: actor },
      executor,
    );
    const finalFacts = await this.readFacts(scope, executor);
    const finalVersion = rentalCashSourceVersion(finalFacts, {
      kind: "settlement",
      settlementId: current.id,
    });
    if (finalVersion !== saved.version)
      throw new Error("Persisted settlement version does not match current finance facts");
    return {
      id: saved.id,
      contractId: saved.contractId,
      eventId: saved.eventId,
      kind: saved.kind,
      effectiveEndDate: saved.effectiveEndDate,
      version: finalVersion,
      revision: saved.revision,
      finalCostMinor: saved.finalCostMinor,
      balance: { ...balance, overdue: false, version: finalVersion },
      status: saved.status,
      confirmedAt: saved.confirmedAt.toISOString(),
      confirmedByUserId: saved.confirmedByUserId,
    };
  }

  private async readFacts(
    scope: FinanceScope,
    executor: AppDbExecutor,
  ): Promise<RentalCashProjectionFacts> {
    const [facts] = await this.projectionSources.readMany(
      scope.organizationId,
      [scope.contractId],
      executor,
    );
    if (
      !facts ||
      facts.contractId !== scope.contractId ||
      facts.organizationId !== scope.organizationId
    )
      throw new Error("Rental finance scope changed during settlement projection");
    return facts;
  }
}

function sumSignedSafe(values: number[], name: string): number {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name}必须是安全整数`);
    return sum + BigInt(value);
  }, 0n);
  if (total > maximum || total < -maximum) throw new RangeError(`${name}超出安全整数范围`);
  return Number(total);
}

function sumSafe(values: number[], name: string): number {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError(`${name}必须是非负安全整数`);
    return sum + BigInt(value);
  }, 0n);
  if (total > maximum) throw new RangeError(`${name}超出安全整数范围`);
  return Number(total);
}

function cashTotals(source: RentalFinanceSnapshot): {
  receivedMinor: number;
  refundedMinor: number;
} {
  let received = 0n;
  let refunded = 0n;
  for (const entry of source.cashEntries) {
    if (entry.revokedAt !== null) continue;
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0)
      throw new RangeError("有效收退款必须为正安全整数");
    if (entry.kind === "receipt") received += BigInt(entry.amountMinor);
    else refunded += BigInt(entry.amountMinor);
  }
  if (received > maximum || refunded > maximum)
    throw new RangeError("合同有效资金超出安全整数范围");
  return { receivedMinor: Number(received), refundedMinor: Number(refunded) };
}
