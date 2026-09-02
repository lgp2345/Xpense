import type { RentalLeaseBlockedReason, RentalLeaseStatus } from "@xpense/shared";

import { type SQL, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalContractSpaces, rentalContracts, rentalSpaces } from "../../db/schema.js";
import type { SpaceLeaseStateFacts } from "./spaces.repository.types.js";

/** 空间合同事实查询输入；requested IDs 一次批量传入。 */
export type SpaceLeaseStatusQueryInput = {
  organizationId: string;
  propertyId: string;
  spaceIds: string[];
  today: string;
};

/** 构建一次返回当前页所有空间自身/祖先/后代合同事实的查询。 */
export function buildSpaceLeaseStatusQuery(input: SpaceLeaseStatusQueryInput): SQL {
  if (input.spaceIds.length === 0) throw new RangeError("空间状态查询不能为空");
  const ids = sql.param(input.spaceIds);
  return sql`
    WITH RECURSIVE
    "requested" AS (
      SELECT "space"."id" AS "space_id", "space"."parent_id"
      FROM ${rentalSpaces} AS "space"
      WHERE "space"."id" = ANY(${ids}::uuid[])
        AND "space"."organization_id" = ${input.organizationId}
        AND "space"."property_id" = ${input.propertyId}
        AND "space"."deleted_at" IS NULL
    ),
    "ancestors" AS (
      SELECT "requested"."space_id" AS "requested_id", "requested"."space_id" AS "related_id", "requested"."parent_id", 0 AS "depth"
      FROM "requested"
      UNION ALL
      SELECT "ancestors"."requested_id", "parent"."id", "parent"."parent_id", "ancestors"."depth" + 1
      FROM "ancestors"
      INNER JOIN ${rentalSpaces} AS "parent"
        ON "parent"."id" = "ancestors"."parent_id"
        AND "parent"."organization_id" = ${input.organizationId}
        AND "parent"."property_id" = ${input.propertyId}
        AND "parent"."deleted_at" IS NULL
      WHERE "ancestors"."depth" < 3
    ),
    "descendants" AS (
      SELECT "requested"."space_id" AS "requested_id", "requested"."space_id" AS "related_id", 0 AS "depth"
      FROM "requested"
      UNION ALL
      SELECT "descendants"."requested_id", "child"."id", "descendants"."depth" + 1
      FROM "descendants"
      INNER JOIN ${rentalSpaces} AS "child"
        ON "child"."parent_id" = "descendants"."related_id"
        AND "child"."organization_id" = ${input.organizationId}
        AND "child"."property_id" = ${input.propertyId}
        AND "child"."deleted_at" IS NULL
      WHERE "descendants"."depth" < 3
    ),
    "relations" AS (
      SELECT "requested_id", "related_id", 'own' AS "relation" FROM "ancestors" WHERE "depth" = 0
      UNION ALL
      SELECT "requested_id", "related_id", 'ancestor' AS "relation" FROM "ancestors" WHERE "depth" > 0
      UNION ALL
      SELECT "requested_id", "related_id", 'descendant' AS "relation" FROM "descendants" WHERE "depth" > 0
    ),
    "candidate_contracts" AS (
      SELECT DISTINCT "contract"."id", "contract"."start_date",
        COALESCE("contract"."termination_date", "contract"."end_date") AS "actual_end"
      FROM ${rentalContracts} AS "contract"
      INNER JOIN ${rentalContractSpaces} AS "contract_space"
        ON "contract_space"."organization_id" = ${input.organizationId}
        AND "contract_space"."contract_id" = "contract"."id"
      INNER JOIN "relations" ON "relations"."related_id" = "contract_space"."space_id"
      WHERE "contract"."organization_id" = ${input.organizationId}
        AND "contract"."property_id" = ${input.propertyId}
        AND "contract"."deleted_at" IS NULL
        AND "contract"."status" IN ('confirmed', 'terminated')
        AND "contract"."start_date" IS NOT NULL
        AND COALESCE("contract"."termination_date", "contract"."end_date") >= ${input.today}::date
    )
    SELECT "requested"."space_id" AS "spaceId",
      COALESCE(bool_or("relations"."relation" = 'own' AND "candidate_contracts"."start_date" <= ${input.today}::date AND ${input.today}::date < "candidate_contracts"."actual_end" - INTERVAL '30 days'), FALSE) AS "hasOwnActive",
      COALESCE(bool_or("relations"."relation" = 'own' AND "candidate_contracts"."start_date" <= ${input.today}::date AND ${input.today}::date >= "candidate_contracts"."actual_end" - INTERVAL '30 days' AND ${input.today}::date <= "candidate_contracts"."actual_end"), FALSE) AS "hasOwnExpiringSoon",
      COALESCE(bool_or("relations"."relation" = 'own' AND "candidate_contracts"."start_date" > ${input.today}::date), FALSE) AS "hasOwnUpcoming",
      COALESCE(bool_or("relations"."relation" = 'ancestor'), FALSE) AS "hasAncestorCurrentOrUpcoming",
      COALESCE(bool_or("relations"."relation" = 'descendant'), FALSE) AS "hasDescendantCurrentOrUpcoming"
    FROM "requested"
    LEFT JOIN "relations" ON "relations"."requested_id" = "requested"."space_id"
    LEFT JOIN ${rentalContractSpaces} AS "contract_space"
      ON "contract_space"."organization_id" = ${input.organizationId}
      AND "contract_space"."space_id" = "relations"."related_id"
    LEFT JOIN "candidate_contracts"
      ON "candidate_contracts"."id" = "contract_space"."contract_id"
    GROUP BY "requested"."space_id"
  `;
}

/** 将空间合同事实按自身状态优先级映射为共享字段。 */
export function toSpaceLeaseState(
  facts: Pick<
    SpaceLeaseStateFacts,
    | "hasOwnActive"
    | "hasOwnExpiringSoon"
    | "hasOwnUpcoming"
    | "hasAncestorCurrentOrUpcoming"
    | "hasDescendantCurrentOrUpcoming"
  >,
): {
  leaseStatus: RentalLeaseStatus;
  leaseBlockedReason: RentalLeaseBlockedReason | null;
  hasUpcomingContract: boolean;
} {
  const leaseStatus: RentalLeaseStatus = facts.hasOwnExpiringSoon
    ? "expiring_soon"
    : facts.hasOwnActive
      ? "active"
      : facts.hasOwnUpcoming
        ? "upcoming"
        : "vacant";
  return {
    leaseStatus,
    leaseBlockedReason:
      leaseStatus === "vacant"
        ? facts.hasAncestorCurrentOrUpcoming
          ? "ancestor_contract"
          : facts.hasDescendantCurrentOrUpcoming
            ? "descendant_contract"
            : null
        : null,
    hasUpcomingContract: facts.hasOwnUpcoming,
  };
}

/** 执行非空页的一次批量状态查询，并补齐未返回行。 */
export async function querySpaceLeaseStates(
  input: SpaceLeaseStatusQueryInput,
  executor: Pick<AppDbExecutor, "execute">,
): Promise<Map<string, SpaceLeaseStateFacts>> {
  if (input.spaceIds.length === 0) return new Map();
  if (typeof executor.execute !== "function")
    throw new Error("Space lease status requires a database execute executor");
  const rows = (await executor.execute(buildSpaceLeaseStatusQuery(input))) as unknown as Array<
    Partial<SpaceLeaseStateFacts> & { spaceId: string }
  >;
  const states = new Map<string, SpaceLeaseStateFacts>();
  for (const id of input.spaceIds) {
    const row = rows.find((candidate) => candidate.spaceId === id);
    states.set(id, {
      spaceId: id,
      hasOwnActive: row?.hasOwnActive === true,
      hasOwnExpiringSoon: row?.hasOwnExpiringSoon === true,
      hasOwnUpcoming: row?.hasOwnUpcoming === true,
      hasAncestorCurrentOrUpcoming: row?.hasAncestorCurrentOrUpcoming === true,
      hasDescendantCurrentOrUpcoming: row?.hasDescendantCurrentOrUpcoming === true,
    });
  }
  return states;
}
