import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import {
  rentalBillLines,
  rentalBillMeterIntervals,
  rentalBillRevisions,
  rentalBills,
  rentalMeterReadings,
} from "../../db/schema.js";
import type {
  BillRevisionActor,
  BillRevisionAppendResult,
  BillRevisionHistory,
  BillRevisionLinesInput,
  BillRevisionPage,
} from "./bill-revisions.repository.types.js";

export type {
  BillRevisionActor,
  BillRevisionAppendResult,
  BillRevisionHistory,
  BillRevisionPage,
  BillRevisionRecord,
} from "./bill-revisions.repository.types.js";

type FinanceScope = { organizationId: string; contractId: string };

/** 当前账单修订、历史快照及计量区间在传入事务中一起替换。 */
@Injectable()
export class BillRevisionsRepository {
  async append(
    scope: FinanceScope,
    billId: string,
    lines: BillRevisionLinesInput,
    amountMinor: number,
    reason: string,
    actor: BillRevisionActor,
    executor: AppDbExecutor,
  ): Promise<BillRevisionAppendResult> {
    const sum = lines.reduce((total, line) => total + BigInt(line.amountMinor), 0n);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || sum !== BigInt(amountMinor)) {
      throw new Error("Rental bill lines do not match bill amount");
    }
    const [bill] = await executor
      .select()
      .from(rentalBills)
      .where(
        and(
          eq(rentalBills.organizationId, scope.organizationId),
          eq(rentalBills.contractId, scope.contractId),
          eq(rentalBills.id, billId),
        ),
      );
    if (!bill) throw new Error("Rental bill not found in contract scope");
    const oldLines = await executor
      .select()
      .from(rentalBillLines)
      .where(
        and(
          eq(rentalBillLines.organizationId, scope.organizationId),
          eq(rentalBillLines.contractId, scope.contractId),
          eq(rentalBillLines.billId, billId),
        ),
      );
    const [revision] = await executor
      .insert(rentalBillRevisions)
      .values({
        ...scope,
        billId,
        revision: bill.revision,
        amountMinor: bill.amountMinor,
        billSnapshot: bill,
        linesSnapshot: oldLines,
        reason,
        createdByUserId: actor.userId,
      })
      .returning();
    if (!revision) throw new Error("Failed to preserve current rental bill revision");

    const [updatedBill] = await executor
      .update(rentalBills)
      .set({ amountMinor, revision: sql`${rentalBills.revision} + 1` })
      .where(
        and(
          eq(rentalBills.organizationId, scope.organizationId),
          eq(rentalBills.contractId, scope.contractId),
          eq(rentalBills.id, billId),
          eq(rentalBills.revision, bill.revision),
        ),
      )
      .returning();
    if (!updatedBill) throw new Error("Rental bill changed during revision");

    await executor
      .delete(rentalBillMeterIntervals)
      .where(
        and(
          eq(rentalBillMeterIntervals.organizationId, scope.organizationId),
          eq(rentalBillMeterIntervals.contractId, scope.contractId),
          eq(rentalBillMeterIntervals.billId, billId),
        ),
      );
    await executor
      .delete(rentalBillLines)
      .where(
        and(
          eq(rentalBillLines.organizationId, scope.organizationId),
          eq(rentalBillLines.contractId, scope.contractId),
          eq(rentalBillLines.billId, billId),
        ),
      );

    const newLines = lines.map((line) => ({
      id: randomUUID(),
      ...line,
      note: line.note ?? null,
      feeSnapshot: line.feeSnapshot ?? null,
      ...scope,
      billId,
    }));
    await executor.insert(rentalBillLines).values(newLines);
    const intervals = await this.buildIntervals(scope, newLines, executor);
    if (intervals.length) await executor.insert(rentalBillMeterIntervals).values(intervals);

    return { bill: updatedBill, revision };
  }

  async history(
    scope: FinanceScope,
    billId: string,
    page: BillRevisionPage,
    executor: AppDbExecutor,
  ): Promise<BillRevisionHistory> {
    const condition = and(
      eq(rentalBillRevisions.organizationId, scope.organizationId),
      eq(rentalBillRevisions.contractId, scope.contractId),
      eq(rentalBillRevisions.billId, billId),
    );
    const pageNumber = Math.max(1, Math.trunc(page.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(page.pageSize)));
    const items = await executor
      .select()
      .from(rentalBillRevisions)
      .where(condition)
      .orderBy(desc(rentalBillRevisions.revision))
      .limit(pageSize)
      .offset((pageNumber - 1) * pageSize);
    const [totalRow] = await executor
      .select({ total: count() })
      .from(rentalBillRevisions)
      .where(condition);
    return { items, total: totalRow?.total ?? 0, page: pageNumber, pageSize };
  }

  private async buildIntervals(
    scope: FinanceScope,
    lines: Array<typeof rentalBillLines.$inferInsert & { id: string; billId: string }>,
    executor: AppDbExecutor,
  ): Promise<Array<typeof rentalBillMeterIntervals.$inferInsert>> {
    const meterLines = lines.flatMap((line) => {
      const snapshot = line.feeSnapshot;
      if (!snapshot || (snapshot.kind !== "water" && snapshot.kind !== "electricity")) return [];
      return [{ line, snapshot }];
    });
    if (!meterLines.length) return [];
    const readingIds = [
      ...new Set(
        meterLines.flatMap(({ snapshot }) => [snapshot.startReadingId, snapshot.endReadingId]),
      ),
    ];
    const readings = await executor
      .select({
        id: rentalMeterReadings.id,
        spaceId: rentalMeterReadings.spaceId,
        kind: rentalMeterReadings.kind,
        predecessorId: rentalMeterReadings.predecessorId,
      })
      .from(rentalMeterReadings)
      .where(
        and(
          eq(rentalMeterReadings.organizationId, scope.organizationId),
          eq(rentalMeterReadings.contractId, scope.contractId),
          inArray(rentalMeterReadings.id, readingIds),
        ),
      );
    const byId = new Map(readings.map((reading) => [reading.id, reading]));
    return meterLines.map(({ line, snapshot }) => {
      const start = byId.get(snapshot.startReadingId);
      const end = byId.get(snapshot.endReadingId);
      if (
        !start ||
        !end ||
        start.spaceId !== end.spaceId ||
        start.kind !== snapshot.kind ||
        end.kind !== snapshot.kind ||
        end.predecessorId !== start.id
      ) {
        throw new Error("Rental bill meter interval no longer matches its reading chain");
      }
      return {
        organizationId: scope.organizationId,
        contractId: scope.contractId,
        spaceId: start.spaceId,
        billId: line.billId,
        billLineId: line.id,
        kind: snapshot.kind,
        startReadingId: start.id,
        endReadingId: end.id,
      };
    });
  }
}
