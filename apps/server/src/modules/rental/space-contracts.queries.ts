import { type SQL, sql } from "drizzle-orm";
import { rentalContractSpaces, rentalContracts, rentalSpaces } from "../../db/schema.js";

/** 按空间主键筛选合同；上下级范围只沿祖先链和后代树遍历，不包含兄弟空间。 */
export function buildSpaceContractCondition(
  organizationId: string,
  spaceId: string,
  scope?: "related",
): SQL {
  const relation =
    scope === "related"
      ? sql`"filter_space"."space_id" <> ${spaceId} AND "filter_space"."space_id" IN (
        WITH RECURSIVE "requested" AS (
          SELECT "id", "parent_id" FROM ${rentalSpaces}
          WHERE "organization_id" = ${organizationId}
            AND "property_id" = ${rentalContracts.propertyId}
            AND "id" = ${spaceId} AND "deleted_at" IS NULL
        ), "ancestors" AS (
          SELECT "id", "parent_id", 0 AS "depth" FROM "requested"
          UNION ALL
          SELECT "parent"."id", "parent"."parent_id", "ancestor"."depth" + 1
          FROM ${rentalSpaces} AS "parent"
          JOIN "ancestors" AS "ancestor" ON "parent"."id" = "ancestor"."parent_id"
          WHERE "parent"."organization_id" = ${organizationId}
            AND "parent"."property_id" = ${rentalContracts.propertyId}
            AND "parent"."deleted_at" IS NULL AND "ancestor"."depth" < 3
        ), "descendants" AS (
          SELECT "id", 0 AS "depth" FROM "requested"
          UNION ALL
          SELECT "child"."id", "descendant"."depth" + 1
          FROM ${rentalSpaces} AS "child"
          JOIN "descendants" AS "descendant" ON "child"."parent_id" = "descendant"."id"
          WHERE "child"."organization_id" = ${organizationId}
            AND "child"."property_id" = ${rentalContracts.propertyId}
            AND "child"."deleted_at" IS NULL AND "descendant"."depth" < 3
        )
        SELECT "id" FROM "ancestors" UNION SELECT "id" FROM "descendants"
      )`
      : sql`"filter_space"."space_id" = ${spaceId}`;
  return sql`EXISTS (
    SELECT 1 FROM ${rentalContractSpaces} AS "filter_space"
    WHERE "filter_space"."organization_id" = "rental_contracts"."organization_id"
      AND "filter_space"."property_id" = "rental_contracts"."property_id"
      AND "filter_space"."contract_id" = "rental_contracts"."id"
      AND ${relation}
  )`;
}
