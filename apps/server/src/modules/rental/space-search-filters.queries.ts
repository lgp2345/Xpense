import { and, type SQL, sql } from "drizzle-orm";
import { rentalContractSpaces, rentalContracts } from "../../db/schema.js";
import { contractDisplayStatusExpression } from "./contracts.repository.select-fields.js";
import type { SpaceSearchInput } from "./spaces.repository.types.js";

/** 搜索页与总数共用的筛选，在分页前按当前空间自身合同派生租赁状态。 */
export function buildSpaceSearchFilters(
  organizationId: string,
  propertyId: string,
  input: SpaceSearchInput,
  keyword: string,
): SQL {
  const conditions: SQL[] = [
    sql`("tree"."name" ILIKE ${keyword} ESCAPE '\\' OR "tree"."code" ILIKE ${keyword} ESCAPE '\\')`,
  ];
  if (input.isEffectivelyActive !== undefined)
    conditions.push(sql`"tree"."is_effectively_active" = ${input.isEffectivelyActive}`);
  if (input.leaseFilter) {
    const status = contractDisplayStatusExpression(input.leaseFilter.now);
    conditions.push(sql`(
      SELECT CASE
        WHEN bool_or(${status} = 'expiring_soon') THEN 'expiring_soon'
        WHEN bool_or(${status} = 'active') THEN 'active'
        WHEN bool_or(${status} = 'upcoming') THEN 'upcoming'
        ELSE 'vacant' END
      FROM ${rentalContracts}
      INNER JOIN ${rentalContractSpaces}
        ON ${rentalContractSpaces.organizationId} = ${organizationId}
        AND ${rentalContractSpaces.propertyId} = ${propertyId}
        AND ${rentalContractSpaces.contractId} = ${rentalContracts.id}
      WHERE ${rentalContracts.organizationId} = ${organizationId}
        AND ${rentalContracts.propertyId} = ${propertyId}
        AND ${rentalContracts.deletedAt} IS NULL
        AND ${rentalContracts.status} IN ('confirmed', 'terminated')
        AND ${rentalContracts.startDate} IS NOT NULL
        AND ${rentalContractSpaces.spaceId} = "tree"."id"
    ) = ${input.leaseFilter.status}`);
  }
  return and(...conditions) as SQL;
}
