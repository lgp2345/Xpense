import type { RentalSpaceType } from "@xpense/shared";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalProperties, rentalSpaces } from "../../db/schema.js";
import { spaceRecordFields } from "./spaces.repository.select-fields.js";
import type {
  FindSpaceSiblingConflictsInput,
  RentalSpacePathNodeRecord,
  SpaceChildrenListInput,
  SpaceSearchInput,
} from "./spaces.repository.types.js";

type SpaceSelectExecutor = Pick<AppDbExecutor, "select">;

/** 四层空间树最多允许从当前节点继续递归三次。 */
const MAX_SPACE_RECURSIVE_DEPTH = 3;

const childRowsFields = {
  id: sql<string>`"space_children_rows"."id"`,
  propertyId: sql<string>`"space_children_rows"."property_id"`,
  parentId: sql<string | null>`"space_children_rows"."parent_id"`,
  name: sql<string>`"space_children_rows"."name"`,
  code: sql<string | null>`"space_children_rows"."code"`,
  type: sql<RentalSpaceType>`"space_children_rows"."type"`,
  customTypeName: sql<string | null>`"space_children_rows"."custom_type_name"`,
  isRentable: sql<boolean>`"space_children_rows"."is_rentable"`,
  isActive: sql<boolean>`"space_children_rows"."is_active"`,
  isEffectivelyActive: sql<boolean>`"space_children_rows"."is_effectively_active"`,
  sortOrder: sql<number>`"space_children_rows"."sort_order"`.mapWith(Number),
  hasChildren: sql<boolean>`"space_children_rows"."has_children"`,
};

const searchRowsFields = {
  id: sql<string>`"space_search_rows"."id"`,
  propertyId: sql<string>`"space_search_rows"."property_id"`,
  parentId: sql<string | null>`"space_search_rows"."parent_id"`,
  name: sql<string>`"space_search_rows"."name"`,
  code: sql<string | null>`"space_search_rows"."code"`,
  type: sql<RentalSpaceType>`"space_search_rows"."type"`,
  customTypeName: sql<string | null>`"space_search_rows"."custom_type_name"`,
  isRentable: sql<boolean>`"space_search_rows"."is_rentable"`,
  isActive: sql<boolean>`"space_search_rows"."is_active"`,
  isEffectivelyActive: sql<boolean>`"space_search_rows"."is_effectively_active"`,
  sortOrder: sql<number>`"space_search_rows"."sort_order"`.mapWith(Number),
  hasChildren: sql<boolean>`"space_search_rows"."has_children"`,
  path: sql<RentalSpacePathNodeRecord[]>`"space_search_rows"."path"`,
};

/** 构建空间完整记录共用的组织、房产、标识和软删除边界。 */
export function buildActiveOwnedSpaceCondition(
  organizationId: string,
  propertyId: string,
  id: string,
): SQL {
  const condition = and(
    eq(rentalSpaces.organizationId, organizationId),
    eq(rentalSpaces.propertyId, propertyId),
    eq(rentalSpaces.id, id),
    isNull(rentalSpaces.deletedAt),
  );
  if (condition === undefined) throw new Error("Active owned space conditions must not be empty");

  return condition;
}

/** 构建组织和房产内空间的稳定行锁查询。 */
export function buildActiveSpaceForUpdateQuery(
  executor: SpaceSelectExecutor,
  organizationId: string,
  propertyId: string,
  id: string,
) {
  return executor
    .select(spaceRecordFields)
    .from(rentalSpaces)
    .where(buildActiveOwnedSpaceCondition(organizationId, propertyId, id))
    .for("update")
    .limit(1);
}

/** 构建同父节点活动空间的名称、编码批量冲突条件。 */
export function buildSpaceSiblingConflictCondition(input: FindSpaceSiblingConflictsInput): SQL {
  const valueConditions: SQL[] = [];
  if (input.names.length > 0) valueConditions.push(inArray(rentalSpaces.name, [...input.names]));
  if (input.codes.length > 0) valueConditions.push(inArray(rentalSpaces.code, [...input.codes]));
  const valueCondition = or(...valueConditions);
  if (valueCondition === undefined) {
    throw new Error("Sibling conflict names and codes must not both be empty");
  }

  const conditions: SQL[] = [
    eq(rentalSpaces.organizationId, input.organizationId),
    eq(rentalSpaces.propertyId, input.propertyId),
    input.parentId === null
      ? isNull(rentalSpaces.parentId)
      : eq(rentalSpaces.parentId, input.parentId),
    eq(rentalSpaces.isActive, true),
    isNull(rentalSpaces.deletedAt),
    valueCondition,
  ];
  if (input.excludeId !== undefined) conditions.push(ne(rentalSpaces.id, input.excludeId));

  const condition = and(...conditions);
  if (condition === undefined) throw new Error("Sibling conflict conditions must not be empty");

  return condition;
}

/** 构建直属子节点的普通筛选条件，供分页条目和总数查询共用。 */
function buildSpaceChildrenConditions(
  organizationId: string,
  propertyId: string,
  parentId: string | null,
): SQL[] {
  return [
    eq(rentalSpaces.organizationId, organizationId),
    eq(rentalSpaces.propertyId, propertyId),
    parentId === null ? isNull(rentalSpaces.parentId) : eq(rentalSpaces.parentId, parentId),
    isNull(rentalSpaces.deletedAt),
  ];
}

/** 构建直属子节点分页总数查询。 */
export function buildSpaceChildrenCountQuery(
  executor: SpaceSelectExecutor,
  organizationId: string,
  propertyId: string,
  input: SpaceChildrenListInput,
) {
  return executor
    .select({ total: count().mapWith(Number) })
    .from(rentalSpaces)
    .where(and(...buildSpaceChildrenConditions(organizationId, propertyId, input.parentId)));
}

/** 构建直属子节点页及批量祖先状态查询，避免逐行回查祖先。 */
export function buildSpaceChildrenQuery(
  executor: SpaceSelectExecutor,
  organizationId: string,
  propertyId: string,
  input: SpaceChildrenListInput,
) {
  const parentCondition =
    input.parentId === null
      ? sql`"space"."parent_id" IS NULL`
      : sql`"space"."parent_id" = ${input.parentId}`;
  const offset = (input.page - 1) * input.pageSize;
  const rows = sql`
    (
      WITH RECURSIVE "page_children" AS (
        SELECT
          "space"."id",
          "space"."property_id",
          "space"."parent_id",
          "space"."name",
          "space"."code",
          "space"."type",
          "space"."custom_type_name",
          "space"."is_rentable",
          "space"."is_active",
          "space"."sort_order"
        FROM ${rentalSpaces} AS "space"
        WHERE "space"."organization_id" = ${organizationId}
          AND "space"."property_id" = ${propertyId}
          AND ${parentCondition}
          AND "space"."deleted_at" IS NULL
        ORDER BY "space"."sort_order" ASC, "space"."name" ASC, "space"."id" ASC
        LIMIT ${input.pageSize}
        OFFSET ${offset}
      ),
      "ancestor_activity" AS (
        SELECT
          "page_child"."id" AS "requested_id",
          "page_child"."id",
          "page_child"."parent_id",
          "page_child"."is_active",
          0::integer AS "depth"
        FROM "page_children" AS "page_child"

        UNION ALL

        SELECT
          "ancestor"."requested_id",
          "parent"."id",
          "parent"."parent_id",
          "parent"."is_active",
          "ancestor"."depth" + 1
        FROM ${rentalSpaces} AS "parent"
        INNER JOIN "ancestor_activity" AS "ancestor"
          ON "parent"."id" = "ancestor"."parent_id"
          AND "parent"."organization_id" = ${organizationId}
          AND "parent"."property_id" = ${propertyId}
        WHERE "parent"."deleted_at" IS NULL
          AND "ancestor"."depth" < ${MAX_SPACE_RECURSIVE_DEPTH}
      )
      SELECT
        "page_child".*,
        (
          "property"."is_active"
          AND NOT EXISTS (
            SELECT 1
            FROM "ancestor_activity" AS "inactive_ancestor"
            WHERE "inactive_ancestor"."requested_id" = "page_child"."id"
              AND "inactive_ancestor"."is_active" IS FALSE
          )
        ) AS "is_effectively_active",
        EXISTS (
          SELECT 1
          FROM ${rentalSpaces} AS "child"
          WHERE "child"."organization_id" = ${organizationId}
            AND "child"."property_id" = ${propertyId}
            AND "child"."parent_id" = "page_child"."id"
            AND "child"."deleted_at" IS NULL
        ) AS "has_children"
      FROM "page_children" AS "page_child"
      INNER JOIN ${rentalProperties} AS "property"
        ON "property"."organization_id" = ${organizationId}
        AND "property"."id" = ${propertyId}
        AND "property"."deleted_at" IS NULL
    ) AS "space_children_rows"
  `;

  return executor
    .select(childRowsFields)
    .from(rows)
    .orderBy(
      asc(sql`"space_children_rows"."sort_order"`),
      asc(sql`"space_children_rows"."name"`),
      asc(sql`"space_children_rows"."id"`),
    );
}

/** 构建从当前空间向根节点回溯的四层内祖先查询。 */
export function buildSpaceAncestorsQuery(
  executor: SpaceSelectExecutor,
  organizationId: string,
  propertyId: string,
  id: string,
) {
  const rows = sql`
    (
      WITH RECURSIVE "space_ancestors" AS (
        SELECT "space"."id", "space"."parent_id", "space"."name", 0::integer AS "depth"
        FROM ${rentalSpaces} AS "space"
        WHERE "space"."organization_id" = ${organizationId}
          AND "space"."property_id" = ${propertyId}
          AND "space"."id" = ${id}
          AND "space"."deleted_at" IS NULL

        UNION ALL

        SELECT "parent"."id", "parent"."parent_id", "parent"."name", "ancestor"."depth" + 1
        FROM ${rentalSpaces} AS "parent"
        INNER JOIN "space_ancestors" AS "ancestor"
          ON "parent"."id" = "ancestor"."parent_id"
          AND "parent"."organization_id" = ${organizationId}
          AND "parent"."property_id" = ${propertyId}
        WHERE "parent"."deleted_at" IS NULL
          AND "ancestor"."depth" < ${MAX_SPACE_RECURSIVE_DEPTH}
      )
      SELECT "id", "name", "depth"
      FROM "space_ancestors"
    ) AS "space_ancestor_rows"
  `;

  return executor
    .select({
      id: sql<string>`"space_ancestor_rows"."id"`,
      name: sql<string>`"space_ancestor_rows"."name"`,
      depth: sql<number>`"space_ancestor_rows"."depth"`.mapWith(Number),
    })
    .from(rows)
    .orderBy(desc(sql`"space_ancestor_rows"."depth"`));
}

/** 构建从当前空间向下遍历的四层内最大相对深度查询。 */
export function buildSpaceSubtreeDepthQuery(
  executor: SpaceSelectExecutor,
  organizationId: string,
  propertyId: string,
  id: string,
) {
  const rows = sql`
    (
      WITH RECURSIVE "space_subtree" AS (
        SELECT "space"."id", 0::integer AS "depth"
        FROM ${rentalSpaces} AS "space"
        WHERE "space"."organization_id" = ${organizationId}
          AND "space"."property_id" = ${propertyId}
          AND "space"."id" = ${id}
          AND "space"."deleted_at" IS NULL

        UNION ALL

        SELECT "child"."id", "subtree"."depth" + 1
        FROM ${rentalSpaces} AS "child"
        INNER JOIN "space_subtree" AS "subtree"
          ON "child"."parent_id" = "subtree"."id"
          AND "child"."organization_id" = ${organizationId}
          AND "child"."property_id" = ${propertyId}
        WHERE "child"."deleted_at" IS NULL
          AND "subtree"."depth" < ${MAX_SPACE_RECURSIVE_DEPTH}
      )
      SELECT COALESCE(MAX("depth"), ${0}) AS "max_depth"
      FROM "space_subtree"
    ) AS "space_subtree_depth_rows"
  `;

  return executor
    .select({
      maxDepth: sql<number>`"space_subtree_depth_rows"."max_depth"`.mapWith(Number),
    })
    .from(rows);
}

/** 构建四层空间树；路径和有效状态均在递归过程中一次累积。 */
function buildSpaceTreeCte(organizationId: string, propertyId: string): SQL {
  return sql`
    WITH RECURSIVE "space_tree" AS (
      SELECT
        "space"."id",
        "space"."property_id",
        "space"."parent_id",
        "space"."name",
        "space"."code",
        "space"."type",
        "space"."custom_type_name",
        "space"."is_rentable",
        "space"."is_active",
        "space"."sort_order",
        ("property"."is_active" AND "space"."is_active") AS "is_effectively_active",
        JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('id', "space"."id", 'name', "space"."name")) AS "path",
        ARRAY[
          LPAD(("space"."sort_order"::bigint + 2147483648)::text, 10, '0')
          || ':' || "space"."name" || ':' || "space"."id"::text
        ]::text[] AS "path_order",
        0::integer AS "depth"
      FROM ${rentalSpaces} AS "space"
      INNER JOIN ${rentalProperties} AS "property"
        ON "property"."organization_id" = ${organizationId}
        AND "property"."id" = ${propertyId}
        AND "property"."deleted_at" IS NULL
      WHERE "space"."organization_id" = ${organizationId}
        AND "space"."property_id" = ${propertyId}
        AND "space"."parent_id" IS NULL
        AND "space"."deleted_at" IS NULL

      UNION ALL

      SELECT
        "child"."id",
        "child"."property_id",
        "child"."parent_id",
        "child"."name",
        "child"."code",
        "child"."type",
        "child"."custom_type_name",
        "child"."is_rentable",
        "child"."is_active",
        "child"."sort_order",
        ("tree"."is_effectively_active" AND "child"."is_active"),
        "tree"."path" || JSONB_BUILD_ARRAY(
          JSONB_BUILD_OBJECT('id', "child"."id", 'name', "child"."name")
        ),
        "tree"."path_order" || ARRAY[
          LPAD(("child"."sort_order"::bigint + 2147483648)::text, 10, '0')
          || ':' || "child"."name" || ':' || "child"."id"::text
        ]::text[],
        "tree"."depth" + 1
      FROM ${rentalSpaces} AS "child"
      INNER JOIN "space_tree" AS "tree"
        ON "child"."parent_id" = "tree"."id"
        AND "child"."organization_id" = ${organizationId}
        AND "child"."property_id" = ${propertyId}
      WHERE "child"."deleted_at" IS NULL
        AND "tree"."depth" < ${MAX_SPACE_RECURSIVE_DEPTH}
    )
  `;
}

/** 构建可定位搜索结果页，路径按根到命中节点返回。 */
export function buildSpaceSearchQuery(
  executor: SpaceSelectExecutor,
  organizationId: string,
  propertyId: string,
  input: SpaceSearchInput,
) {
  const keyword = `%${input.keyword}%`;
  const offset = (input.page - 1) * input.pageSize;
  const rows = sql`
    (
      ${buildSpaceTreeCte(organizationId, propertyId)}
      SELECT
        "tree".*,
        EXISTS (
          SELECT 1
          FROM ${rentalSpaces} AS "child"
          WHERE "child"."organization_id" = ${organizationId}
            AND "child"."property_id" = ${propertyId}
            AND "child"."parent_id" = "tree"."id"
            AND "child"."deleted_at" IS NULL
        ) AS "has_children"
      FROM "space_tree" AS "tree"
      WHERE "tree"."name" ILIKE ${keyword}
        OR "tree"."code" ILIKE ${keyword}
      ORDER BY "tree"."path_order" ASC, "tree"."id" ASC
      LIMIT ${input.pageSize}
      OFFSET ${offset}
    ) AS "space_search_rows"
  `;

  return executor
    .select(searchRowsFields)
    .from(rows)
    .orderBy(asc(sql`"space_search_rows"."path_order"`), asc(sql`"space_search_rows"."id"`));
}

/** 构建与搜索页使用同一有界路径范围的总数查询。 */
export function buildSpaceSearchCountQuery(
  executor: SpaceSelectExecutor,
  organizationId: string,
  propertyId: string,
  input: SpaceSearchInput,
) {
  const keyword = `%${input.keyword}%`;
  const rows = sql`
    (
      ${buildSpaceTreeCte(organizationId, propertyId)}
      SELECT COUNT(*) AS "total"
      FROM "space_tree" AS "tree"
      WHERE "tree"."name" ILIKE ${keyword}
        OR "tree"."code" ILIKE ${keyword}
    ) AS "space_search_count_rows"
  `;

  return executor
    .select({ total: sql<number>`"space_search_count_rows"."total"`.mapWith(Number) })
    .from(rows);
}
