import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";

const url = rentalTestDatabaseUrl(process.env);
const migration = new URL(
  "./migrations/20261023002049_organization_settings_menus/migration.sql",
  import.meta.url,
);
describe.skipIf(!url)("组织设置增量迁移", () => {
  it("only grants builtin owners and appends reachable settings without overwriting custom menus, idempotently", async () => {
    if (!url) throw Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ client, applyMigrations }) => {
      await applyMigrations("20261022083504_organization_management");
      const user = randomUUID(),
        org = randomUUID(),
        emptyOrg = randomUUID();
      await client`INSERT INTO users (id,password_hash) VALUES (${user},'unused-test-hash')`;
      for (const id of [org, emptyOrg])
        await client`INSERT INTO organizations (id,name,created_by_user_id) VALUES (${id},${id},${user})`;
      for (const key of ["owner", "admin", "custom"])
        await client`INSERT INTO roles (key,name,is_system) VALUES (${key},${key},${key !== "custom"})`;
      await client`INSERT INTO menus (organization_id,type,name,is_visible,sort_order) VALUES (${org},'directory','自定义目录',true,777)`;
      const original = await client`SELECT * FROM menus ORDER BY id`;
      await applyMigrations();
      const nodes = await client`SELECT * FROM menus ORDER BY id`;
      for (const id of [org, emptyOrg]) {
        const settings = nodes.filter(
          (n) => n.organization_id === id && n.route_key === "OrganizationSettings",
        );
        expect(settings).toHaveLength(1);
        expect(settings[0]).toMatchObject({
          parent_id: null,
          keep_alive: false,
          permission_code: "organization_settings:read",
        });
        if (id === org) expect(settings[0]?.sort_order).toBeGreaterThan(777);
        expect(
          nodes.find(
            (n) => n.organization_id === id && n.permission_code === "organization_settings:update",
          )?.parent_id,
        ).toBe(settings[0]?.id);
      }
      for (const before of original) expect(nodes.find((n) => n.id === before.id)).toEqual(before);
      const grants =
        await client`SELECT r.key,p.key AS permission FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.resource='organization_settings' ORDER BY r.key,p.key`;
      expect(grants.map((g) => [g.key, g.permission])).toEqual([
        ["owner", "organization_settings:read"],
        ["owner", "organization_settings:update"],
      ]);
      await client.begin(async (tx) => {
        await tx.unsafe(await readFile(migration, "utf8"));
      });
      expect(await client`SELECT * FROM menus ORDER BY id`).toEqual(nodes);
      expect(
        await client`SELECT count(*)::int AS count FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.resource='organization_settings'`,
      ).toEqual([{ count: 2 }]);
    });
  });
});
