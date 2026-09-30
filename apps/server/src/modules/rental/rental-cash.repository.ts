import { Injectable } from "@nestjs/common";
import { and, count, desc, eq, isNull } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalCashEntries } from "../../db/schema.js";
import type {
  RentalCashActor,
  RentalCashHistory,
  RentalCashPage,
  RentalCashRecord,
  RentalCashTarget,
  RentalCashWriteInput,
} from "./rental-cash.repository.types.js";

export type {
  RentalCashActor,
  RentalCashHistory,
  RentalCashPage,
  RentalCashRecord,
  RentalCashTarget,
  RentalCashWriteInput,
} from "./rental-cash.repository.types.js";

type FinanceScope = { organizationId: string; contractId: string };

/** 资金记录按 bill/settlement 目标查询；撤销只追加字段，不删除历史。 */
@Injectable()
export class RentalCashRepository {
  async list(
    scope: FinanceScope,
    target: RentalCashTarget,
    page: RentalCashPage,
    executor: AppDbExecutor,
  ): Promise<RentalCashHistory> {
    const condition = and(
      eq(rentalCashEntries.organizationId, scope.organizationId),
      eq(rentalCashEntries.contractId, scope.contractId),
      target.kind === "bill"
        ? eq(rentalCashEntries.billId, target.billId)
        : eq(rentalCashEntries.settlementId, target.settlementId),
    );
    const pageNumber = Math.max(1, Math.trunc(page.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(page.pageSize)));
    const items = await executor
      .select()
      .from(rentalCashEntries)
      .where(condition)
      .orderBy(desc(rentalCashEntries.occurredOn), desc(rentalCashEntries.createdAt))
      .limit(pageSize)
      .offset((pageNumber - 1) * pageSize);
    const [totalRow] = await executor
      .select({ total: count() })
      .from(rentalCashEntries)
      .where(condition);
    return { items, total: totalRow?.total ?? 0, page: pageNumber, pageSize };
  }

  async allForContract(scope: FinanceScope, executor: AppDbExecutor): Promise<RentalCashRecord[]> {
    return executor
      .select()
      .from(rentalCashEntries)
      .where(
        and(
          eq(rentalCashEntries.organizationId, scope.organizationId),
          eq(rentalCashEntries.contractId, scope.contractId),
        ),
      )
      .orderBy(rentalCashEntries.occurredOn, rentalCashEntries.createdAt);
  }

  async insert(
    scope: FinanceScope,
    input: RentalCashWriteInput,
    actor: RentalCashActor,
    executor: AppDbExecutor,
  ): Promise<RentalCashRecord> {
    const [record] = await executor
      .insert(rentalCashEntries)
      .values({
        ...scope,
        billId: input.target.kind === "bill" ? input.target.billId : null,
        settlementId: input.target.kind === "settlement" ? input.target.settlementId : null,
        kind: input.kind,
        purpose: input.purpose,
        amountMinor: input.amountMinor,
        occurredOn: input.occurredOn,
        note: input.note,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!record) throw new Error("Failed to save rental cash entry");
    return record;
  }

  async revoke(
    scope: FinanceScope,
    entryId: string,
    reason: string,
    actor: RentalCashActor,
    executor: AppDbExecutor,
  ): Promise<RentalCashRecord> {
    const [record] = await executor
      .update(rentalCashEntries)
      .set({ revokedAt: new Date(), revokedByUserId: actor.userId, revokeReason: reason })
      .where(
        and(
          eq(rentalCashEntries.organizationId, scope.organizationId),
          eq(rentalCashEntries.contractId, scope.contractId),
          eq(rentalCashEntries.id, entryId),
          isNull(rentalCashEntries.revokedAt),
        ),
      )
      .returning();
    if (!record) throw new Error("Current rental cash entry changed or is outside contract scope");
    return record;
  }
}
