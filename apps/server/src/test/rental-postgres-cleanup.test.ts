import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertRentalCleanupObjects } from "./rental-postgres-cleanup.js";

describe("租赁演练清理的依赖边界", () => {
  it("清理查询不能枚举少数 catalog 后 INNER JOIN 丢弃未知类，或豁免全部 TOAST", async () => {
    const source = await readFile(new URL("./rental-postgres-harness.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/JOIN objects dependent ON/);
    expect(source).not.toContain("NOT LIKE 'pg_toast%'");
  });
  it("外部 operator 或未知归属均拒绝，不会因未知 catalog 丢弃", () => {
    const schema = `rental_finance_test_${"a".repeat(32)}`;
    const root = { catalog: "pg_namespace", objectId: 1, namespace: schema };
    expect(() => assertRentalCleanupObjects(schema, [root])).not.toThrow();
    for (const object of [
      { catalog: "pg_operator", objectId: 2, namespace: "other_persistent" },
      { catalog: "unknown_catalog", objectId: 3, namespace: null },
      { catalog: "pg_class", objectId: 4, namespace: "pg_toast_external" },
    ])
      expect(() => assertRentalCleanupObjects(schema, [root, object])).toThrow("拒绝清理");
    expect(() => assertRentalCleanupObjects(schema, [])).toThrow("拒绝清理");
  });
  it("查询从根闭包保留未知类，TOAST 由本次表和索引归属证明", async () => {
    const source = await readFile(new URL("./rental-postgres-cleanup.ts", import.meta.url), "utf8");
    expect(source).toContain("WITH RECURSIVE");
    expect(source).toContain("pg_identify_object(c.classid, c.objid, c.objsubid)");
    expect(source).toContain("LEFT JOIN owners");
    expect(source).toContain("reltoastrelid");
    expect(source).not.toContain("NOT LIKE 'pg_toast%'");
  });
});
