import { Injectable } from "@nestjs/common";
import type { RentalBillingStartInput } from "@xpense/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { AppDbExecutor, AppDbTransaction } from "../../db/db.module.js";
import { rentalBillingStarts, rentalContractSpaces, rentalMeterReadings } from "../../db/schema.js";
import type { BillingStartRecord, FinanceScope } from "./rental-finance.types.js";

@Injectable()
export class BillingStartsRepository {
  async find(scope: FinanceScope, executor: AppDbExecutor): Promise<BillingStartRecord | null> {
    const [record] = await executor
      .select()
      .from(rentalBillingStarts)
      .where(
        and(
          eq(rentalBillingStarts.organizationId, scope.organizationId),
          eq(rentalBillingStarts.contractId, scope.contractId),
          isNull(rentalBillingStarts.invalidatedAt),
        ),
      );
    if (!record) return null;
    const readings = await executor
      .select()
      .from(rentalMeterReadings)
      .where(
        and(
          eq(rentalMeterReadings.organizationId, scope.organizationId),
          eq(rentalMeterReadings.contractId, scope.contractId),
          eq(rentalMeterReadings.billingStartId, record.id),
        ),
      );
    return { ...record, baselineReadings: readings };
  }
  async invalidate(scope: FinanceScope, tx: AppDbTransaction): Promise<void> {
    await tx
      .update(rentalBillingStarts)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(rentalBillingStarts.organizationId, scope.organizationId),
          eq(rentalBillingStarts.contractId, scope.contractId),
          isNull(rentalBillingStarts.invalidatedAt),
        ),
      );
  }
  async create(
    scope: FinanceScope,
    input: RentalBillingStartInput,
    actor: { userId: string },
    tx: AppDbTransaction,
  ): Promise<BillingStartRecord> {
    const [record] = await tx
      .insert(rentalBillingStarts)
      .values({ ...scope, firstPeriodStart: input.firstPeriodStart, createdByUserId: actor.userId })
      .returning();
    if (!record) throw new Error("Failed to persist rental billing start");
    // 空间由合同关联查询，不能由公共输入指定。
    const spaces = await tx
      .select({ spaceId: rentalContractSpaces.spaceId })
      .from(rentalContractSpaces)
      .where(
        and(
          eq(rentalContractSpaces.organizationId, scope.organizationId),
          eq(rentalContractSpaces.contractId, scope.contractId),
        ),
      );
    if (spaces.length !== 1 || !spaces[0])
      throw new Error("Billing start requires one contract space");
    const baselineReadings = input.baselineReadings.length
      ? await tx
          .insert(rentalMeterReadings)
          .values(
            input.baselineReadings.map((reading) => ({
              ...scope,
              ...reading,
              spaceId: spaces[0]!.spaceId,
              source: "billing_start" as const,
              billingStartId: record.id,
              predecessorId: null,
              reason: "首次出账接续起算读数",
              createdByUserId: actor.userId,
              updatedByUserId: actor.userId,
            })),
          )
          .returning()
      : [];
    return { ...record, baselineReadings };
  }
}
