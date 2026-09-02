import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { rentalContractNumberCounters, rentalContracts } from "../../db/schema.js";
import {
  buildActiveOwnedContractCondition,
  buildContractCountQuery,
  buildContractDetailQuery,
  buildContractForUpdateQuery,
  buildContractListQuery,
  buildContractReferenceQuery,
  buildPropertyContractCountsQuery,
} from "./contracts.queries.js";
import { contractRecordFields } from "./contracts.repository.select-fields.js";
import type {
  ContractListInput,
  ContractReferenceQueryInput,
  ContractReferenceSummary,
  CreateDraftContractInput,
  PropertyContractCounts,
  RentalContractDetailRecord,
  RentalContractPageRecord,
  RentalContractRecord,
  SetContractLifecycleInput,
  SoftDeleteContractInput,
  UpdateContractHeaderInput,
} from "./contracts.repository.types.js";

export type { RentalContractRecord } from "./contracts.repository.types.js";

/** 构建单语句原子递增的组织年度合同编号计数器。 */
export function buildNextContractNumberStatement(organizationId: string, year: number): SQL {
  return sql`
    INSERT INTO ${rentalContractNumberCounters} ("organization_id", "year", "last_value")
    VALUES (${organizationId}, ${year}, ${1})
    ON CONFLICT ("organization_id", "year") DO UPDATE SET
      "last_value" = ${rentalContractNumberCounters.lastValue} + 1,
      "updated_at" = NOW()
    RETURNING "last_value" AS "lastValue"
  `;
}

function readCounterValue(rows: unknown): number {
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const value = row && typeof row === "object" && "lastValue" in row ? row.lastValue : undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Failed to allocate rental contract number");
  }
  return value;
}

/** 负责合同头的组织作用域读取、行锁、编号分配与持久化。 */
@Injectable()
export class ContractsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** 查询组织内未删除合同的稳定分页摘要。 */
  async list(
    organizationId: string,
    today: string,
    input: ContractListInput,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalContractPageRecord> {
    const [items, totals] = await Promise.all([
      buildContractListQuery(executor, organizationId, today, input),
      buildContractCountQuery(executor, organizationId, today, input),
    ]);
    return { items, total: totals[0]?.total ?? 0, page: input.page, pageSize: input.pageSize };
  }

  /** 查询组织内未删除合同的聚合详情。 */
  async detail(
    organizationId: string,
    id: string,
    today: string,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalContractDetailRecord | null> {
    const [contract] = await buildContractDetailQuery(executor, organizationId, id, today);
    return contract ?? null;
  }

  /** 查询组织内未删除合同头。 */
  async find(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<RentalContractRecord | null> {
    const [contract] = await executor
      .select(contractRecordFields)
      .from(rentalContracts)
      .where(buildActiveOwnedContractCondition(organizationId, id))
      .limit(1);
    return contract ?? null;
  }

  /** 在调用方事务中锁定组织内未删除合同头。 */
  async findForUpdate(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<RentalContractRecord | null> {
    const [contract] = await buildContractForUpdateQuery(executor, organizationId, id);
    return contract ?? null;
  }

  /** 在调用方事务中按合同主键稳定锁定并汇总安全引用分类。 */
  async findContractReferenceSummary(
    input: ContractReferenceQueryInput,
    executor: AppDbExecutor,
  ): Promise<ContractReferenceSummary> {
    if (typeof executor.execute !== "function")
      throw new Error("Contract reference protection requires a database execute executor");
    const [row] = Array.from(await executor.execute(buildContractReferenceQuery(input))) as Array<
      Partial<ContractReferenceSummary>
    >;
    return {
      own: row?.own === true,
      descendant: row?.descendant === true,
      oldAncestor: row?.oldAncestor === true,
      newAncestor: row?.newAncestor === true,
    };
  }

  /** 查询房产当前/未来合同互斥计数。 */
  async countPropertyContracts(
    organizationId: string,
    propertyId: string,
    today: string,
    executor: AppDbExecutor = this.db,
  ): Promise<PropertyContractCounts> {
    if (typeof executor.execute !== "function")
      throw new Error("Property contract counts requires a database execute executor");
    const [row] = Array.from(
      await executor.execute(buildPropertyContractCountsQuery(organizationId, propertyId, today)),
    ) as Array<Partial<PropertyContractCounts>>;
    return {
      activeContractCount: Number(row?.activeContractCount ?? 0),
      upcomingContractCount: Number(row?.upcomingContractCount ?? 0),
      expiringSoonContractCount: Number(row?.expiringSoonContractCount ?? 0),
    };
  }

  /** 使用调用方事务执行器原子分配组织年度合同编号。 */
  async nextContractNumber(
    organizationId: string,
    year: number,
    executor: Pick<AppDbExecutor, "execute">,
  ): Promise<string> {
    if (!Number.isInteger(year) || year < 1 || year > 9999)
      throw new RangeError("合同编号年份无效");
    const value = readCounterValue(
      await executor.execute(buildNextContractNumberStatement(organizationId, year)),
    );
    return `RC-${String(year).padStart(4, "0")}-${String(value).padStart(6, "0")}`;
  }

  /** 在调用方事务中创建草稿合同头。 */
  async createDraft(
    input: CreateDraftContractInput,
    executor: AppDbExecutor,
  ): Promise<RentalContractRecord> {
    const [contract] = await executor
      .insert(rentalContracts)
      .values({ ...input, status: "draft" })
      .returning(contractRecordFields);
    if (!contract) throw new Error("Failed to create rental contract draft");
    return contract;
  }

  /** 更新组织内未删除合同头的可变资料。 */
  async updateHeader(
    input: UpdateContractHeaderInput,
    executor: AppDbExecutor,
  ): Promise<RentalContractRecord> {
    const [contract] = await executor
      .update(rentalContracts)
      .set({
        propertyId: input.propertyId,
        externalContractNumber: input.externalContractNumber,
        startDate: input.startDate,
        endDate: input.endDate,
        rentAmountMinor: input.rentAmountMinor,
        billingAnchor: input.billingAnchor,
        paymentIntervalMonths: input.paymentIntervalMonths,
        dueDaysBefore: input.dueDaysBefore,
        note: input.note,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      })
      .where(buildActiveOwnedContractCondition(input.organizationId, input.id))
      .returning(contractRecordFields);
    if (!contract) throw new Error("Failed to update rental contract header");
    return contract;
  }

  /** 更新组织内未删除合同的生命周期与对应审计字段。 */
  async setLifecycle(
    input: SetContractLifecycleInput,
    executor: AppDbExecutor,
  ): Promise<RentalContractRecord> {
    const [contract] = await executor
      .update(rentalContracts)
      .set({
        status: input.status,
        cancelledAt: input.cancelledAt,
        cancelledByUserId: input.cancelledByUserId,
        cancellationReason: input.cancellationReason,
        terminationDate: input.terminationDate,
        terminationRecordedAt: input.terminationRecordedAt,
        terminatedByUserId: input.terminatedByUserId,
        terminationReason: input.terminationReason,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      })
      .where(
        and(
          buildActiveOwnedContractCondition(input.organizationId, input.id),
          input.expectedStatus ? eq(rentalContracts.status, input.expectedStatus) : undefined,
        ),
      )
      .returning(contractRecordFields);
    if (!contract) throw new Error("Failed to update rental contract lifecycle");
    return contract;
  }

  /** 仅软删除组织内仍为草稿的合同。 */
  async softDelete(input: SoftDeleteContractInput, executor: AppDbExecutor): Promise<void> {
    const now = new Date();
    await executor
      .update(rentalContracts)
      .set({
        deletedAt: now,
        deletedByUserId: input.deletedByUserId,
        updatedByUserId: input.updatedByUserId,
        updatedAt: now,
      })
      .where(
        and(
          buildActiveOwnedContractCondition(input.organizationId, input.id),
          eq(rentalContracts.status, "draft"),
          isNull(rentalContracts.deletedAt),
        ),
      );
  }
}
