import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { RentalSettlementDetail } from "@xpense/shared";
import type { AppDbTransaction } from "../../db/db.module.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import type { PeriodSettlementPlan } from "./period-settlement.rules.js";
import { settlementStatus } from "./period-settlement.rules.js";
import type { FinanceScope } from "./rental-finance.types.js";
import type { SettlementReadingCandidate } from "./rental-settlement-readings.rules.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";
/** 结算头、终读数、独立费用快照与关联在同一调用方事务完成，不改写普通账单。 */
@Injectable()
export class SettlementWriteService {
  constructor(
    private readonly settlements: RentalSettlementsRepository,
    private readonly readings: MeterReadingsRepository,
    private readonly projection: SettlementProjectionService,
  ) {}
  async persist(
    scope: FinanceScope,
    plan: PeriodSettlementPlan,
    candidates: SettlementReadingCandidate[],
    actor: { userId: string },
    tx: AppDbTransaction,
  ): Promise<RentalSettlementDetail> {
    const head = await this.settlements.create(
      scope,
      plan,
      {
        settlementId: randomUUID(),
        eventId: randomUUID(),
        kind: plan.kind,
        status: settlementStatus(plan.differenceMinor),
        version: plan.version,
      },
      actor,
      tx,
    );
    const ids = new Map<string, string>();
    for (const candidate of candidates) {
      const saved = await this.readings.appendBoundary(
        scope,
        { ...candidate.write, source: "settlement", settlementId: head.id },
        "退租最终读数快照",
        actor,
        tx,
      );
      ids.set(candidate.reading.id, saved.id);
    }
    const persisted: PeriodSettlementPlan = {
      ...plan,
      terminalLines: plan.terminalLines.map((line) => {
        const fee = line.feeSnapshot;
        if (!fee || !("endReadingId" in fee)) return line;
        const id = ids.get(fee.endReadingId);
        if (!id) throw new Error("Terminal reading snapshot missing persisted ID");
        return { ...line, feeSnapshot: { ...fee, endReadingId: id } };
      }),
    };
    await this.settlements.finalizeSnapshot(scope, head.id, persisted, tx);
    await this.settlements.linkBills(scope, head.id, plan.billIds, tx);
    const result = await this.projection.refresh(scope, actor.userId, tx);
    if (!result) throw new Error("Settlement projection missing inside transaction");
    return result;
  }
}
