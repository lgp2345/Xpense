import { type SQL, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalContractSpaces, rentalContracts, rentalSpaces } from "../../db/schema.js";
import type {
  ContractSpaceConflictInput,
  RentalContractSpaceConflictRecord,
} from "./contracts.repository.types.js";

const MAX_SPACE_RECURSIVE_DEPTH = 3;

export const SPACE_CONFLICT_QUERY_ADAPTER = Symbol("rental.space-conflict.query-adapter.v1");

export interface SpaceConflictQueryAdapter {
  readonly [SPACE_CONFLICT_QUERY_ADAPTER]: true;
  spaceConflict(input: ContractSpaceConflictInput): Promise<RentalContractSpaceConflictRecord[]>;
}

/** 构建同房产四层空间树内祖先、当前节点及后代的闭区间冲突查询。 */
export function buildSpaceConflictStatement(input: ContractSpaceConflictInput): SQL {
  if (input.spaceIds.length === 0) throw new RangeError("待检查空间不能为空");
  const excludeCondition =
    input.excludeContractId === undefined
      ? sql``
      : sql`AND "contract"."id" <> ${input.excludeContractId}`;

  return sql`
    /* rental.space-conflict.v1 */
    WITH RECURSIVE "requested_spaces" AS (
      SELECT "space"."id", "space"."parent_id"
      FROM ${rentalSpaces} AS "space"
      WHERE "space"."organization_id" = ${input.organizationId}
        AND "space"."property_id" = ${input.propertyId}
        AND "space"."id" = ANY(${sql.param(input.spaceIds)}::uuid[])
        AND "space"."deleted_at" IS NULL
    ),
    "space_ancestors" AS (
      SELECT "requested"."id", "requested"."parent_id", 0::integer AS "depth"
      FROM "requested_spaces" AS "requested"

      UNION ALL

      SELECT "parent"."id", "parent"."parent_id", "ancestor"."depth" + 1
      FROM ${rentalSpaces} AS "parent"
      INNER JOIN "space_ancestors" AS "ancestor"
        ON "parent"."id" = "ancestor"."parent_id"
        AND "parent"."organization_id" = ${input.organizationId}
        AND "parent"."property_id" = ${input.propertyId}
      WHERE "parent"."deleted_at" IS NULL
        AND "ancestor"."depth" < ${MAX_SPACE_RECURSIVE_DEPTH}
    ),
    "space_descendants" AS (
      SELECT "requested"."id", 0::integer AS "depth"
      FROM "requested_spaces" AS "requested"

      UNION ALL

      SELECT "child"."id", "descendant"."depth" + 1
      FROM ${rentalSpaces} AS "child"
      INNER JOIN "space_descendants" AS "descendant"
        ON "child"."parent_id" = "descendant"."id"
        AND "child"."organization_id" = ${input.organizationId}
        AND "child"."property_id" = ${input.propertyId}
      WHERE "child"."deleted_at" IS NULL
        AND "descendant"."depth" < ${MAX_SPACE_RECURSIVE_DEPTH}
    ),
    "candidate_spaces" AS (
      SELECT "id" FROM "space_ancestors"
      UNION
      SELECT "id" FROM "space_descendants"
    )
    SELECT DISTINCT
      "contract"."id" AS "contractId",
      "contract"."contract_number" AS "contractNumber",
      "contract_space"."space_id" AS "spaceId"
    FROM "candidate_spaces" AS "candidate"
    INNER JOIN ${rentalContractSpaces} AS "contract_space"
      ON "contract_space"."organization_id" = ${input.organizationId}
      AND "contract_space"."space_id" = "candidate"."id"
    INNER JOIN ${rentalContracts} AS "contract"
      ON "contract"."organization_id" = ${input.organizationId}
      AND "contract"."property_id" = ${input.propertyId}
      AND "contract"."id" = "contract_space"."contract_id"
    WHERE "contract"."deleted_at" IS NULL
      AND "contract"."status" IN ('confirmed', 'terminated')
      AND "contract"."start_date" <= ${input.endDate}::date
      AND COALESCE("contract"."termination_date", "contract"."end_date") >= ${input.startDate}::date
      ${excludeCondition}
    ORDER BY "contract"."contract_number", "contract"."id", "contract_space"."space_id"
  `;
}

/** 执行空间冲突查询，仅返回安全合同与空间标识。 */
export async function findSpaceConflicts(
  input: ContractSpaceConflictInput,
  executor: Pick<AppDbExecutor, "execute">,
): Promise<RentalContractSpaceConflictRecord[]> {
  const candidate = executor as Pick<AppDbExecutor, "execute"> & Partial<SpaceConflictQueryAdapter>;
  const marker = candidate[SPACE_CONFLICT_QUERY_ADAPTER];
  const method = candidate.spaceConflict;
  if (marker !== undefined || method !== undefined) {
    if (marker !== true || typeof method !== "function") {
      throw new Error("space-conflict query adapter capability configuration error");
    }
    return method.call(candidate, input);
  }
  const rows = await executor.execute(buildSpaceConflictStatement(input));
  return Array.from(rows) as RentalContractSpaceConflictRecord[];
}
