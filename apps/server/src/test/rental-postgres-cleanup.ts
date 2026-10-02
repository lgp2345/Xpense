import type postgres from "postgres";
import { assertRentalTestSchema } from "./rental-postgres-corpus.js";

export type RentalCleanupObject = { catalog: string; objectId: number; namespace: string | null };

/** 完整依赖闭包中的任一对象无法证明归属时拒绝清理，不以 catalog 白名单过滤。 */
export function assertRentalCleanupObjects(schema: string, objects: RentalCleanupObject[]): void {
  assertRentalTestSchema(schema);
  if (!objects.length || objects.some((object) => object.namespace !== schema)) {
    throw new Error("拒绝清理：依赖闭包存在其他命名空间或归属未知对象");
  }
}

/** 从 schema 根递归追踪所有依赖；内部/分区所有权也反向追踪，避免 CASCADE 转移删除起点。 */
export async function readRentalCleanupObjects(
  client: ReturnType<typeof postgres>,
  schemaOid: number,
) {
  return client<RentalCleanupObject[]>`
    WITH RECURSIVE owned_toast AS (
      SELECT reltoastrelid AS oid FROM pg_class WHERE relnamespace = ${schemaOid} AND reltoastrelid <> 0
    ), owned_relations AS (
      SELECT oid FROM owned_toast
      UNION SELECT indexrelid FROM pg_index WHERE indrelid IN (SELECT oid FROM owned_toast)
    ), owners AS (
      SELECT 'pg_namespace'::regclass::oid AS classid, oid, oid AS namespace FROM pg_namespace
      UNION ALL SELECT 'pg_class'::regclass::oid, oid,
        CASE WHEN oid IN (SELECT oid FROM owned_relations) THEN ${schemaOid} ELSE relnamespace END FROM pg_class
      UNION ALL SELECT 'pg_type'::regclass::oid, oid,
        CASE WHEN typrelid IN (SELECT oid FROM owned_relations) THEN ${schemaOid} ELSE typnamespace END FROM pg_type
      UNION ALL SELECT 'pg_proc'::regclass::oid, oid, pronamespace FROM pg_proc
      UNION ALL SELECT 'pg_constraint'::regclass::oid, oid, connamespace FROM pg_constraint
      UNION ALL SELECT 'pg_attrdef'::regclass::oid, a.oid, c.relnamespace FROM pg_attrdef a JOIN pg_class c ON c.oid = a.adrelid
      UNION ALL SELECT 'pg_trigger'::regclass::oid, t.oid, c.relnamespace FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      UNION ALL SELECT 'pg_policy'::regclass::oid, p.oid, c.relnamespace FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      UNION ALL SELECT 'pg_rewrite'::regclass::oid, r.oid, c.relnamespace FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
    ), edges AS (
      SELECT refclassid AS from_class, refobjid AS from_id, refobjsubid AS from_sub,
        classid AS to_class, objid AS to_id, objsubid AS to_sub FROM pg_depend
      UNION ALL SELECT classid, objid, objsubid, refclassid, refobjid, refobjsubid
        FROM pg_depend WHERE deptype IN ('i', 'P', 'S')
    ), closure AS (
      SELECT 'pg_namespace'::regclass::oid AS classid, ${schemaOid}::oid AS objid, 0::integer AS objsubid
      UNION SELECT e.to_class, e.to_id, e.to_sub FROM closure c JOIN edges e
        ON e.from_class = c.classid AND e.from_id = c.objid AND (c.objsubid = 0 OR e.from_sub = c.objsubid)
    ) SELECT c.classid::regclass::text AS catalog, c.objid::integer AS "objectId",
        COALESCE(n.nspname, identified.schema) AS namespace
      FROM closure c
      LEFT JOIN owners owner ON owner.classid = c.classid AND owner.oid = c.objid
      LEFT JOIN pg_namespace n ON n.oid = owner.namespace
      LEFT JOIN LATERAL pg_identify_object(c.classid, c.objid, c.objsubid) identified ON TRUE`;
}
