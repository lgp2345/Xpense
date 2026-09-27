import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { rentalBillAdjustments } from "../../db/schema.js";
import type { BillingWriteContext } from "./billing.types.js";
import type { AdjustmentRecord, NewAdjustment } from "./bills.repository.types.js";

/** 在调用方事务内维护终止确认事件，不删除历史记录。 */
@Injectable()
export class BillAdjustmentsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async findCurrent(
    organizationId: string,
    contractId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<AdjustmentRecord | null> {
    const [record] = await executor
      .select()
      .from(rentalBillAdjustments)
      .where(
        and(
          eq(rentalBillAdjustments.organizationId, organizationId),
          eq(rentalBillAdjustments.contractId, contractId),
          isNull(rentalBillAdjustments.revokedAt),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async insert(input: NewAdjustment, executor: AppDbExecutor): Promise<AdjustmentRecord> {
    const [record] = await executor.insert(rentalBillAdjustments).values(input).returning();
    if (!record) throw new Error("Failed to save rental bill adjustment");
    return record;
  }

  async revoke(
    context: BillingWriteContext,
    contractId: string,
    adjustmentId: string,
    reason: string,
    executor: AppDbExecutor,
  ): Promise<void> {
    const rows = await executor
      .update(rentalBillAdjustments)
      .set({ revokedAt: new Date(), revokedByUserId: context.userId, revokeReason: reason })
      .where(
        and(
          eq(rentalBillAdjustments.organizationId, context.organizationId),
          eq(rentalBillAdjustments.contractId, contractId),
          eq(rentalBillAdjustments.id, adjustmentId),
          isNull(rentalBillAdjustments.revokedAt),
        ),
      )
      .returning({ id: rentalBillAdjustments.id });
    if (rows.length !== 1) throw new Error("Current rental bill adjustment changed");
  }
}
