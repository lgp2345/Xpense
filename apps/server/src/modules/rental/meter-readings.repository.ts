import { Injectable } from "@nestjs/common";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import {
  rentalBillMeterIntervals,
  rentalMeterReadingRevisions,
  rentalMeterReadings,
} from "../../db/schema.js";
import type {
  MeterReadingActor,
  MeterReadingRecord,
  MeterReadingRevisionRecord,
  MeterReadingWriteInput,
} from "./meter-readings.repository.types.js";

export type {
  MeterReadingRecord,
  MeterReadingRevisionRecord,
  MeterReadingWriteInput,
} from "./meter-readings.repository.types.js";

type FinanceScope = { organizationId: string; contractId: string };

/** 水电读数按合同作用域持久化；所有写入只使用调用方事务。 */
@Injectable()
export class MeterReadingsRepository {
  async list(scope: FinanceScope, executor: AppDbExecutor): Promise<MeterReadingRecord[]> {
    return executor
      .select()
      .from(rentalMeterReadings)
      .where(
        and(
          eq(rentalMeterReadings.organizationId, scope.organizationId),
          eq(rentalMeterReadings.contractId, scope.contractId),
        ),
      )
      .orderBy(rentalMeterReadings.kind, rentalMeterReadings.readingDate, rentalMeterReadings.id);
  }

  async saveBaseline(
    scope: FinanceScope,
    readings: MeterReadingWriteInput[],
    reason: string,
    actor: MeterReadingActor,
    executor: AppDbExecutor,
  ): Promise<MeterReadingRecord[]> {
    const saved: MeterReadingRecord[] = [];
    for (const input of readings) {
      if (input.predecessorId !== null)
        throw new Error("Baseline readings cannot have a predecessor");
      const [current] = await executor
        .select()
        .from(rentalMeterReadings)
        .where(
          and(
            eq(rentalMeterReadings.organizationId, scope.organizationId),
            eq(rentalMeterReadings.contractId, scope.contractId),
            eq(rentalMeterReadings.kind, input.kind),
            isNull(rentalMeterReadings.predecessorId),
          ),
        );
      if (!current) {
        const [record] = await executor
          .insert(rentalMeterReadings)
          .values({
            ...scope,
            ...input,
            revision: 1,
            reason,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          })
          .returning();
        if (!record) throw new Error("Failed to save rental meter baseline");
        saved.push(record);
        continue;
      }
      await this.appendRevision(scope, current, reason, actor, executor);
      const [record] = await executor
        .update(rentalMeterReadings)
        .set({
          spaceId: input.spaceId,
          readingDate: input.readingDate,
          reading: input.reading,
          reason,
          revision: sql`${rentalMeterReadings.revision} + 1`,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rentalMeterReadings.organizationId, scope.organizationId),
            eq(rentalMeterReadings.contractId, scope.contractId),
            eq(rentalMeterReadings.id, current.id),
            isNull(rentalMeterReadings.predecessorId),
          ),
        )
        .returning();
      if (!record) throw new Error("Rental meter baseline changed during update");
      saved.push(record);
    }
    return saved;
  }

  async appendBoundary(
    scope: FinanceScope,
    input: MeterReadingWriteInput,
    reason: string,
    actor: MeterReadingActor,
    executor: AppDbExecutor,
  ): Promise<MeterReadingRecord> {
    if (!input.predecessorId)
      throw new Error("Meter boundary requires a server-derived predecessor");
    const [record] = await executor
      .insert(rentalMeterReadings)
      .values({
        ...scope,
        ...input,
        revision: 1,
        reason,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
      })
      .returning();
    if (!record) throw new Error("Failed to append rental meter boundary");
    return record;
  }

  async reviseBoundary(
    scope: FinanceScope,
    id: string,
    input: MeterReadingWriteInput,
    reason: string,
    actor: MeterReadingActor,
    executor: AppDbExecutor,
  ): Promise<MeterReadingRecord> {
    const [current] = await executor
      .select()
      .from(rentalMeterReadings)
      .where(
        and(
          eq(rentalMeterReadings.organizationId, scope.organizationId),
          eq(rentalMeterReadings.contractId, scope.contractId),
          eq(rentalMeterReadings.id, id),
        ),
      );
    if (!current) throw new Error("Rental meter reading not found in contract scope");
    await this.appendRevision(scope, current, reason, actor, executor);
    const [record] = await executor
      .update(rentalMeterReadings)
      .set({
        spaceId: input.spaceId,
        kind: input.kind,
        readingDate: input.readingDate,
        reading: input.reading,
        predecessorId: input.predecessorId,
        reason,
        revision: sql`${rentalMeterReadings.revision} + 1`,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rentalMeterReadings.organizationId, scope.organizationId),
          eq(rentalMeterReadings.contractId, scope.contractId),
          eq(rentalMeterReadings.id, id),
          eq(rentalMeterReadings.revision, current.revision),
        ),
      )
      .returning();
    if (!record) throw new Error("Rental meter reading changed during revision");
    return record;
  }

  async findAdjacentBillIds(
    scope: FinanceScope,
    readingId: string,
    executor: AppDbExecutor,
  ): Promise<string[]> {
    const records = await executor
      .select({ billId: rentalBillMeterIntervals.billId })
      .from(rentalBillMeterIntervals)
      .where(
        and(
          eq(rentalBillMeterIntervals.organizationId, scope.organizationId),
          eq(rentalBillMeterIntervals.contractId, scope.contractId),
          or(
            eq(rentalBillMeterIntervals.startReadingId, readingId),
            eq(rentalBillMeterIntervals.endReadingId, readingId),
          ),
        ),
      );
    return [...new Set(records.map(({ billId }) => billId))];
  }

  private async appendRevision(
    scope: FinanceScope,
    current: MeterReadingRecord,
    reason: string,
    actor: MeterReadingActor,
    executor: AppDbExecutor,
  ): Promise<MeterReadingRevisionRecord> {
    const [revision] = await executor
      .insert(rentalMeterReadingRevisions)
      .values({
        ...scope,
        readingId: current.id,
        revision: current.revision,
        snapshot: current,
        reason,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!revision) throw new Error("Failed to preserve rental meter reading revision");
    return revision;
  }
}
