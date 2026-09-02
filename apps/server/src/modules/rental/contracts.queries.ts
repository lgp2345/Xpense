import { and, count, desc, eq, gte, ilike, isNull, lte, or, type SQL, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import {
  rentalContractPartyPeriods,
  rentalContractSpaces,
  rentalContracts,
  rentalProperties,
  rentalSpaces,
  rentalTenants,
} from "../../db/schema.js";
import {
  contractDetailFields,
  contractDisplayStatusExpression,
  contractRecordFields,
  contractSummaryFields,
} from "./contracts.repository.select-fields.js";
import type {
  ContractListInput,
  ContractReferenceQueryInput,
} from "./contracts.repository.types.js";

type ContractSelectExecutor = Pick<AppDbExecutor, "select">;

/** 构建组织内未软删除合同的标识条件。 */
export function buildActiveOwnedContractCondition(organizationId: string, id: string): SQL {
  const condition = and(
    eq(rentalContracts.organizationId, organizationId),
    eq(rentalContracts.id, id),
    isNull(rentalContracts.deletedAt),
  );
  if (condition === undefined) throw new Error("Contract ownership conditions must not be empty");
  return condition;
}

/** 构建合同列表和总数共用的组织、软删除及派生筛选条件。 */
export function buildContractListConditions(
  organizationId: string,
  today: string,
  input: ContractListInput,
): SQL[] {
  const conditions: SQL[] = [
    eq(rentalContracts.organizationId, organizationId),
    isNull(rentalContracts.deletedAt),
  ];
  if (input.propertyId !== undefined)
    conditions.push(eq(rentalContracts.propertyId, input.propertyId));
  if (input.tenantId !== undefined) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${rentalContractPartyPeriods}
      WHERE ${rentalContractPartyPeriods.organizationId} = ${organizationId}
        AND ${rentalContractPartyPeriods.contractId} = ${rentalContracts.id}
        AND ${rentalContractPartyPeriods.tenantId} = ${input.tenantId}
    )`);
  }
  if (input.status !== undefined) {
    conditions.push(sql`${contractDisplayStatusExpression(today)} = ${input.status}`);
  }
  if (input.startDateFrom !== undefined)
    conditions.push(gte(rentalContracts.startDate, input.startDateFrom));
  if (input.startDateTo !== undefined)
    conditions.push(lte(rentalContracts.startDate, input.startDateTo));
  if (input.endDateFrom !== undefined)
    conditions.push(gte(rentalContracts.endDate, input.endDateFrom));
  if (input.endDateTo !== undefined) conditions.push(lte(rentalContracts.endDate, input.endDateTo));
  if (input.keyword !== undefined) {
    const pattern = `%${input.keyword}%`;
    const keywordCondition = or(
      ilike(rentalContracts.contractNumber, pattern),
      ilike(rentalContracts.externalContractNumber, pattern),
      sql`EXISTS (
        SELECT 1 FROM ${rentalProperties}
        WHERE ${rentalProperties.organizationId} = ${organizationId}
          AND ${rentalProperties.id} = ${rentalContracts.propertyId}
          AND ${rentalProperties.name} ILIKE ${pattern}
      )`,
      sql`EXISTS (
        SELECT 1 FROM ${rentalContractPartyPeriods} AS "keyword_period"
        LEFT JOIN ${rentalTenants} AS "keyword_tenant"
          ON "keyword_tenant"."organization_id" = "keyword_period"."organization_id"
          AND "keyword_tenant"."id" = "keyword_period"."tenant_id"
          AND "keyword_tenant"."deleted_at" IS NULL
        WHERE "keyword_period"."organization_id" = ${organizationId}
          AND "keyword_period"."contract_id" = ${rentalContracts.id}
          AND COALESCE("keyword_period"."tenant_name_snapshot", "keyword_tenant"."name") ILIKE ${pattern}
      )`,
      sql`EXISTS (
        SELECT 1 FROM ${rentalContractSpaces} AS "keyword_space"
        LEFT JOIN ${rentalSpaces} AS "keyword_space_source"
          ON "keyword_space_source"."organization_id" = "keyword_space"."organization_id"
          AND "keyword_space_source"."property_id" = "keyword_space"."property_id"
          AND "keyword_space_source"."id" = "keyword_space"."space_id"
          AND "keyword_space_source"."deleted_at" IS NULL
        WHERE "keyword_space"."organization_id" = ${organizationId}
          AND "keyword_space"."contract_id" = ${rentalContracts.id}
          AND COALESCE("keyword_space"."space_name_snapshot", "keyword_space_source"."name") ILIKE ${pattern}
      )`,
    );
    if (keywordCondition) conditions.push(keywordCondition);
  }
  return conditions;
}

/** 构建按最近更新与标识稳定排序的合同页。 */
export function buildContractListQuery(
  executor: ContractSelectExecutor,
  organizationId: string,
  today: string,
  input: ContractListInput,
) {
  return executor
    .select(contractSummaryFields(today))
    .from(rentalContracts)
    .where(and(...buildContractListConditions(organizationId, today, input)))
    .orderBy(desc(rentalContracts.updatedAt), desc(rentalContracts.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
}

/** 构建与合同页完全一致筛选范围的总数查询。 */
export function buildContractCountQuery(
  executor: ContractSelectExecutor,
  organizationId: string,
  today: string,
  input: ContractListInput,
) {
  return executor
    .select({ total: count().mapWith(Number) })
    .from(rentalContracts)
    .where(and(...buildContractListConditions(organizationId, today, input)));
}

/** 构建组织作用域内合同聚合详情查询。 */
export function buildContractDetailQuery(
  executor: ContractSelectExecutor,
  organizationId: string,
  id: string,
  today: string,
) {
  return executor
    .select(contractDetailFields(today))
    .from(rentalContracts)
    .where(buildActiveOwnedContractCondition(organizationId, id))
    .limit(1);
}

/** 构建组织作用域内合同行锁查询。 */
export function buildContractForUpdateQuery(
  executor: ContractSelectExecutor,
  organizationId: string,
  id: string,
) {
  return executor
    .select(contractRecordFields)
    .from(rentalContracts)
    .where(buildActiveOwnedContractCondition(organizationId, id))
    .for("update")
    .limit(1);
}

/** 构建当前/未来合同引用保护查询；候选合同按主键稳定行锁。 */
export function buildContractReferenceQuery(input: ContractReferenceQueryInput) {
  const hasSpaceCategories = [
    input.ownSpaceIds,
    input.descendantSpaceIds,
    input.oldAncestorSpaceIds,
    input.newAncestorSpaceIds,
  ].some((ids) => ids !== undefined);
  const relation = hasSpaceCategories
    ? sql`AND "contract_space"."space_id" = ANY(${sql.param([
        ...(input.ownSpaceIds ?? []),
        ...(input.descendantSpaceIds ?? []),
        ...(input.oldAncestorSpaceIds ?? []),
        ...(input.newAncestorSpaceIds ?? []),
      ])}::uuid[])`
    : sql``;
  const own = input.ownSpaceIds?.length
    ? sql`("contract_space"."space_id" = ANY(${sql.param(input.ownSpaceIds)}::uuid[]))`
    : sql`FALSE`;
  const descendant = input.descendantSpaceIds?.length
    ? sql`("contract_space"."space_id" = ANY(${sql.param(input.descendantSpaceIds)}::uuid[]))`
    : sql`FALSE`;
  const oldAncestor = input.oldAncestorSpaceIds?.length
    ? sql`("contract_space"."space_id" = ANY(${sql.param(input.oldAncestorSpaceIds)}::uuid[]))`
    : sql`FALSE`;
  const newAncestor = input.newAncestorSpaceIds?.length
    ? sql`("contract_space"."space_id" = ANY(${sql.param(input.newAncestorSpaceIds)}::uuid[]))`
    : sql`FALSE`;

  return sql`
    WITH "candidate_ids" AS (
      SELECT DISTINCT "contract_space"."contract_id"
      FROM ${rentalContractSpaces} AS "contract_space"
      INNER JOIN ${rentalContracts} AS "candidate"
        ON "candidate"."organization_id" = ${input.organizationId}
        AND "candidate"."property_id" = ${input.propertyId}
        AND "candidate"."id" = "contract_space"."contract_id"
      WHERE "contract_space"."organization_id" = ${input.organizationId}
        AND "candidate"."deleted_at" IS NULL
        AND "candidate"."status" IN ('confirmed', 'terminated')
        AND COALESCE("candidate"."termination_date", "candidate"."end_date") >= ${input.today}::date
        ${relation}
    ),
    "locked_contracts" AS (
      SELECT "candidate"."id", "candidate"."start_date",
        COALESCE("candidate"."termination_date", "candidate"."end_date") AS "actual_end"
      FROM ${rentalContracts} AS "candidate"
      INNER JOIN "candidate_ids" ON "candidate_ids"."contract_id" = "candidate"."id"
      ORDER BY "candidate"."id"
      FOR UPDATE
    )
    SELECT
      COALESCE(bool_or(${hasSpaceCategories ? own : sql`TRUE`}), FALSE) AS "own",
      COALESCE(bool_or(${hasSpaceCategories ? descendant : sql`FALSE`}), FALSE) AS "descendant",
      COALESCE(bool_or(${hasSpaceCategories ? oldAncestor : sql`FALSE`}), FALSE) AS "oldAncestor",
      COALESCE(bool_or(${hasSpaceCategories ? newAncestor : sql`FALSE`}), FALSE) AS "newAncestor"
    FROM "locked_contracts"
    INNER JOIN ${rentalContractSpaces} AS "contract_space"
      ON "contract_space"."organization_id" = ${input.organizationId}
      AND "contract_space"."contract_id" = "locked_contracts"."id"
    WHERE "contract_space"."organization_id" = ${input.organizationId}
      ${relation}
  `;
}

/** 构建房产当前/未来合同三桶互斥计数。 */
export function buildPropertyContractCountsQuery(
  organizationId: string,
  propertyId: string,
  today: string,
) {
  return sql`
    SELECT
      COUNT(*) FILTER (
        WHERE "contract"."start_date" <= ${today}::date
          AND ${today}::date < COALESCE("contract"."termination_date", "contract"."end_date") - INTERVAL '30 days'
      )::integer AS "activeContractCount",
      COUNT(*) FILTER (
        WHERE "contract"."start_date" > ${today}::date
      )::integer AS "upcomingContractCount",
      COUNT(*) FILTER (
        WHERE "contract"."start_date" <= ${today}::date
          AND ${today}::date >= COALESCE("contract"."termination_date", "contract"."end_date") - INTERVAL '30 days'
          AND ${today}::date <= COALESCE("contract"."termination_date", "contract"."end_date")
      )::integer AS "expiringSoonContractCount"
    FROM ${rentalContracts} AS "contract"
    WHERE "contract"."organization_id" = ${organizationId}
      AND "contract"."property_id" = ${propertyId}
      AND "contract"."deleted_at" IS NULL
      AND "contract"."status" IN ('confirmed', 'terminated')
  `;
}
