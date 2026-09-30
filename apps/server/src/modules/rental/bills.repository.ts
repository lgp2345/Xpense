import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ListRentalBillsQuery, RentalBillDetail, RentalBillPage } from "@xpense/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import {
  rentalBillGenerations,
  rentalBillLines,
  rentalBillMeterIntervals,
  rentalBillNumberCounters,
  rentalBills,
} from "../../db/schema.js";
import type {
  BillingSource,
  BillingWriteContext,
  PersistableBillingDraft,
} from "./billing.types.js";
import { loadBillDetails, queryBillDetail, queryBillPage } from "./bills.queries.js";
import type { BillRecord, GenerationRecord, NewGeneration } from "./bills.repository.types.js";

/** 整批原子领取编号，竞争者不会领取相同范围。 */
export function buildNextBillNumbersStatement(organizationId: string, year: number, count: number) {
  return sql`INSERT INTO ${rentalBillNumberCounters} ("organization_id", "year", "last_value") VALUES (${organizationId}, ${year}, ${count}) ON CONFLICT ("organization_id", "year") DO UPDATE SET "last_value" = ${rentalBillNumberCounters.lastValue} + ${count}, "updated_at" = NOW() RETURNING "last_value" AS "lastValue"`;
}

/** 账单持久化只使用上层传入的事务，不自行提交。 */
@Injectable()
export class BillsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async findGeneration(
    organizationId: string,
    idempotencyKey: string,
    executor: AppDbExecutor,
  ): Promise<GenerationRecord | null> {
    const [record] = await executor
      .select()
      .from(rentalBillGenerations)
      .where(
        and(
          eq(rentalBillGenerations.organizationId, organizationId),
          eq(rentalBillGenerations.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createGeneration(input: NewGeneration, executor: AppDbExecutor): Promise<GenerationRecord> {
    const [record] = await executor.insert(rentalBillGenerations).values(input).returning();
    if (!record) throw new Error("Failed to save rental bill generation");
    return record;
  }

  async insertBills(
    context: BillingWriteContext,
    source: BillingSource,
    generationId: string,
    drafts: PersistableBillingDraft[],
    executor: AppDbExecutor,
  ): Promise<BillRecord[]> {
    if (!drafts.length) return [];
    const year = Number(context.today.slice(0, 4));
    const rows = Array.from(
      await executor.execute(
        buildNextBillNumbersStatement(context.organizationId, year, drafts.length),
      ),
    ) as Array<{ lastValue: number }>;
    const lastValue = rows[0]?.lastValue;
    if (!Number.isSafeInteger(lastValue) || lastValue === undefined || lastValue < drafts.length)
      throw new Error("Failed to allocate rental bill numbers");
    const contract = source.contract;
    const snapshot = {
      propertyId: contract.propertyId,
      propertyName: contract.propertyName,
      contractNumber: contract.contractNumber,
      spaces: contract.spaces,
      parties: contract.parties.map(({ tenantId, name, isPrimaryPayer }) => ({
        tenantId,
        name,
        isPrimaryPayer,
      })),
    };
    const result: BillRecord[] = [];
    for (let offset = 0; offset < drafts.length; offset += 500) {
      const batch = drafts.slice(offset, offset + 500).map((draft, index) => ({
        draft,
        id: randomUUID(),
        number: lastValue - drafts.length + offset + index + 1,
      }));
      for (const { draft } of batch) {
        const sum = draft.lines.reduce((total, line) => total + BigInt(line.amountMinor), 0n);
        if (sum !== BigInt(draft.amountMinor))
          throw new Error("Rental bill lines do not match bill amount");
      }
      const inserted = await executor
        .insert(rentalBills)
        .values(
          batch.map(({ draft, id, number }) => ({
            id,
            organizationId: context.organizationId,
            contractId: contract.id,
            propertyId: contract.propertyId,
            billNumber: `RB-${year}-${String(number).padStart(6, "0")}`,
            contractNumber: contract.contractNumber,
            propertyName: contract.propertyName,
            currencyCode: source.currencyCode,
            type: draft.type,
            status: "active" as const,
            modelVersion: draft.modelVersion ?? 1,
            billingMonth: draft.billingMonth ?? null,
            revision: draft.revision ?? 1,
            sourceKey: draft.sourceKey,
            periodStart: draft.periodStart,
            periodEnd: draft.periodEnd,
            effectiveEnd: draft.effectiveEnd,
            dueDate: draft.dueDate,
            amountMinor: draft.amountMinor,
            generationId,
            adjustmentId: draft.adjustmentId,
            snapshot,
            depositSourceId: draft.depositSourceId,
            depositSnapshot: draft.depositSnapshot,
            createdByUserId: context.userId,
          })),
        )
        .returning();
      if (inserted.length !== batch.length)
        throw new Error("Failed to persist complete rental bill batch");
      const lines = batch.flatMap(({ draft, id }) =>
        draft.lines.map((line) => ({
          id: randomUUID(),
          ...line,
          note: line.note ?? null,
          feeSnapshot: line.feeSnapshot ?? null,
          billId: id,
          organizationId: context.organizationId,
          contractId: contract.id,
        })),
      );
      for (let lineOffset = 0; lineOffset < lines.length; lineOffset += 500)
        await executor.insert(rentalBillLines).values(lines.slice(lineOffset, lineOffset + 500));
      const spaceId = contract.spaces.length === 1 ? contract.spaces[0]?.spaceId : undefined;
      const intervals = lines.flatMap((line) => {
        const snapshot = line.feeSnapshot;
        if (!snapshot || (snapshot.kind !== "water" && snapshot.kind !== "electricity")) return [];
        if (!spaceId) throw new Error("Meter interval requires the contract's scoped space");
        return [
          {
            organizationId: context.organizationId,
            contractId: contract.id,
            spaceId,
            billId: line.billId,
            billLineId: line.id,
            kind: snapshot.kind,
            startReadingId: snapshot.startReadingId,
            endReadingId: snapshot.endReadingId,
          },
        ];
      });
      for (let offset = 0; offset < intervals.length; offset += 500)
        await executor
          .insert(rentalBillMeterIntervals)
          .values(intervals.slice(offset, offset + 500));
      result.push(...inserted);
    }
    return result;
  }

  async voidBills(
    context: BillingWriteContext,
    billIds: string[],
    reasonCode: string,
    executor: AppDbExecutor,
  ): Promise<void> {
    for (let offset = 0; offset < billIds.length; offset += 500)
      await executor
        .update(rentalBills)
        .set({
          status: "voided",
          voidedAt: new Date(),
          voidedBy: context.userId,
          voidReason: reasonCode,
        })
        .where(
          and(
            eq(rentalBills.organizationId, context.organizationId),
            eq(rentalBills.status, "active"),
            inArray(rentalBills.id, billIds.slice(offset, offset + 500)),
          ),
        );
  }

  async activeForContract(
    organizationId: string,
    contractId: string,
    executor: AppDbExecutor,
  ): Promise<RentalBillDetail[]> {
    const rows = await executor
      .select()
      .from(rentalBills)
      .where(
        and(
          eq(rentalBills.organizationId, organizationId),
          eq(rentalBills.contractId, contractId),
          eq(rentalBills.status, "active"),
        ),
      );
    return loadBillDetails(rows, executor);
  }

  async hasHistory(
    organizationId: string,
    contractId: string,
    executor: AppDbExecutor,
  ): Promise<boolean> {
    const rows = await executor
      .select({ id: rentalBills.id })
      .from(rentalBills)
      .where(
        and(eq(rentalBills.organizationId, organizationId), eq(rentalBills.contractId, contractId)),
      )
      .limit(1);
    return rows.length > 0;
  }

  list(
    organizationId: string,
    query: ListRentalBillsQuery,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalBillPage> {
    return queryBillPage(organizationId, query, executor);
  }
  detail(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalBillDetail | null> {
    return queryBillDetail(organizationId, id, executor);
  }
}
