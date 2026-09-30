import { Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import {
  rentalSettlementBills,
  rentalSettlementRevisions,
  rentalSettlements,
} from "../../db/schema.js";
import type { SettlementPlan } from "./rental-finance.types.js";
import type {
  RentalSettlementActor,
  RentalSettlementEvent,
  RentalSettlementHistory,
  RentalSettlementPage,
  RentalSettlementProjection,
  RentalSettlementRecord,
} from "./rental-settlements.repository.types.js";

export type {
  RentalSettlementActor,
  RentalSettlementBillRecord,
  RentalSettlementEvent,
  RentalSettlementHistory,
  RentalSettlementPage,
  RentalSettlementProjection,
  RentalSettlementRecord,
  RentalSettlementRevisionRecord,
} from "./rental-settlements.repository.types.js";

type FinanceScope = { organizationId: string; contractId: string };

/** 结算当前投影、不可变版本与纳入账单关系。 */
@Injectable()
export class RentalSettlementsRepository {
  /** 组织限定的只读 scope locator；后续动作需在合同锁内重读完整资源。 */
  async findContractId(
    organizationId: string,
    settlementId: string,
    executor: AppDbExecutor,
  ): Promise<string | null> {
    const [record] = await executor
      .select({ contractId: rentalSettlements.contractId })
      .from(rentalSettlements)
      .where(
        and(
          eq(rentalSettlements.organizationId, organizationId),
          eq(rentalSettlements.id, settlementId),
        ),
      )
      .limit(1);
    return record?.contractId ?? null;
  }

  async findCurrent(
    scope: FinanceScope,
    executor: AppDbExecutor,
  ): Promise<RentalSettlementRecord | null> {
    const [record] = await executor
      .select()
      .from(rentalSettlements)
      .where(
        and(
          eq(rentalSettlements.organizationId, scope.organizationId),
          eq(rentalSettlements.contractId, scope.contractId),
        ),
      );
    return record ?? null;
  }

  /** 从真实关联表读取本结算纳入的完整账单 ID 集合。 */
  async billIds(
    scope: FinanceScope,
    settlementId: string,
    executor: AppDbExecutor,
  ): Promise<string[]> {
    const records = await executor
      .select({ billId: rentalSettlementBills.billId })
      .from(rentalSettlementBills)
      .where(
        and(
          eq(rentalSettlementBills.organizationId, scope.organizationId),
          eq(rentalSettlementBills.contractId, scope.contractId),
          eq(rentalSettlementBills.settlementId, settlementId),
        ),
      )
      .orderBy(asc(rentalSettlementBills.billId));
    return records.map(({ billId }) => billId);
  }

  async create(
    scope: FinanceScope,
    plan: SettlementPlan,
    event: RentalSettlementEvent,
    actor: RentalSettlementActor,
    executor: AppDbExecutor,
  ): Promise<RentalSettlementRecord> {
    const [record] = await executor
      .insert(rentalSettlements)
      .values({
        ...scope,
        eventId: event.eventId,
        kind: event.kind,
        effectiveEndDate: plan.effectiveEndDate,
        version: event.version,
        revision: 1,
        finalCostMinor: plan.finalCostMinor,
        status: event.status,
        snapshot: plan,
        confirmedByUserId: actor.userId,
      })
      .returning();
    if (!record) throw new Error("Failed to create rental settlement");
    return record;
  }

  async linkBills(
    scope: FinanceScope,
    settlementId: string,
    billIds: string[],
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor
      .delete(rentalSettlementBills)
      .where(
        and(
          eq(rentalSettlementBills.organizationId, scope.organizationId),
          eq(rentalSettlementBills.contractId, scope.contractId),
          eq(rentalSettlementBills.settlementId, settlementId),
        ),
      );
    if (!billIds.length) return;
    await executor.insert(rentalSettlementBills).values(
      [...new Set(billIds)].map((billId) => ({
        ...scope,
        settlementId,
        billId,
      })),
    );
  }

  async revise(
    scope: FinanceScope,
    settlementId: string,
    projection: RentalSettlementProjection,
    actor: RentalSettlementActor,
    executor: AppDbExecutor,
  ): Promise<RentalSettlementRecord> {
    const [current] = await executor
      .select()
      .from(rentalSettlements)
      .where(
        and(
          eq(rentalSettlements.organizationId, scope.organizationId),
          eq(rentalSettlements.contractId, scope.contractId),
          eq(rentalSettlements.id, settlementId),
        ),
      );
    if (!current) throw new Error("Rental settlement not found in contract scope");
    const [revision] = await executor
      .insert(rentalSettlementRevisions)
      .values({
        ...scope,
        settlementId,
        revision: current.revision,
        snapshot: current,
        reason: projection.reason ?? null,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!revision) throw new Error("Failed to preserve rental settlement revision");
    const [record] = await executor
      .update(rentalSettlements)
      .set({
        effectiveEndDate: projection.plan.effectiveEndDate,
        version: projection.version,
        revision: current.revision + 1,
        finalCostMinor: projection.plan.finalCostMinor,
        status: projection.status,
        snapshot: projection.plan,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rentalSettlements.organizationId, scope.organizationId),
          eq(rentalSettlements.contractId, scope.contractId),
          eq(rentalSettlements.id, settlementId),
          eq(rentalSettlements.revision, current.revision),
        ),
      )
      .returning();
    if (!record) throw new Error("Rental settlement changed during revision");
    return record;
  }

  async history(
    scope: FinanceScope,
    page: RentalSettlementPage,
    executor: AppDbExecutor,
  ): Promise<RentalSettlementHistory> {
    const condition = and(
      eq(rentalSettlementRevisions.organizationId, scope.organizationId),
      eq(rentalSettlementRevisions.contractId, scope.contractId),
    );
    const pageNumber = Math.max(1, Math.trunc(page.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(page.pageSize)));
    const items = await executor
      .select()
      .from(rentalSettlementRevisions)
      .where(condition)
      .orderBy(desc(rentalSettlementRevisions.createdAt), desc(rentalSettlementRevisions.revision))
      .limit(pageSize)
      .offset((pageNumber - 1) * pageSize);
    const [totalRow] = await executor
      .select({ total: count() })
      .from(rentalSettlementRevisions)
      .where(condition);
    return { items, total: totalRow?.total ?? 0, page: pageNumber, pageSize };
  }
}
