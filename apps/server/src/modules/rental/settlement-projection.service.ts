import { Injectable } from "@nestjs/common";
import type { RentalSettlementDetail } from "@xpense/shared";
import type { AppDbExecutor } from "../../db/db.module.js";
import { calculateRentalCashBalance } from "./rental-cash.rules.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type { FinanceScope } from "./rental-finance.types.js";
import { settlementStatus } from "./period-settlement.rules.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
/** 确认后的成本永远取结算快照；资金变动只刷新余额、状态与版本。 */
@Injectable()
export class SettlementProjectionService {
  constructor(
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
    const [facts] = await this.projectionSources.readMany(
      scope.organizationId,
      [scope.contractId],
      executor,
    );
    if (
      !facts ||
      facts.organizationId !== scope.organizationId ||
      facts.contractId !== scope.contractId ||
      facts.settlement?.id !== current.id
    )
      throw new Error("Settlement scope changed during projection");
    const target = { kind: "settlement", settlementId: current.id } as const;
    const balance = calculateRentalCashBalance(
      facts.cashEntries,
      target,
      current.finalCostMinor,
      null,
      current.effectiveEndDate,
    );
    const differenceMinor = balance.outstandingMinor - balance.refundableMinor;
    const status = settlementStatus(differenceMinor);
    const version = rentalCashSourceVersion(
      { ...facts, settlement: { ...facts.settlement, revision: current.revision + 1, status } },
      target,
    );
    const saved = await this.settlements.revise(
      scope,
      current.id,
      {
        plan: {
          ...current.snapshot,
          differenceMinor,
          receivedMinor: balance.receivedMinor,
          refundedMinor: balance.refundedMinor,
        },
        status,
        version,
        reason: "同步结算资金余额",
      },
      { userId: actor },
      executor,
    );
    const [finalFacts] = await this.projectionSources.readMany(
      scope.organizationId,
      [scope.contractId],
      executor,
    );
    if (!finalFacts) throw new Error("Missing settlement finance facts");
    const finalVersion = rentalCashSourceVersion(finalFacts, target);
    if (saved.version !== finalVersion)
      throw new Error("Settlement version differs from persisted finance facts");
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
}
