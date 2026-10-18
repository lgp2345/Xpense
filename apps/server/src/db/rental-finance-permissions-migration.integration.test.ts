import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";

const url = rentalTestDatabaseUrl(process.env);
const migrationUrl = new URL(
  "./migrations/20261018155703_rental_finance_permission_menus/migration.sql",
  import.meta.url,
);

describe.skipIf(!url)("租赁财务权限与菜单增量迁移", () => {
  it("按组织补齐操作、保留自定义节点与授权，重复执行不新增菜单或授权", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ client, applyMigrations }) => {
      await applyMigrations("20261011014246_remove_rental_meter_reading_dates");
      const userId = randomUUID();
      const firstOrg = randomUUID();
      const secondOrg = randomUUID();
      const emptyOrg = randomUUID();
      await client`INSERT INTO users (id, email, password_hash) VALUES (${userId}, 'finance-test@example.invalid', 'unused-test-hash')`;
      for (const id of [firstOrg, secondOrg, emptyOrg]) {
        await client`INSERT INTO organizations (id, name, created_by_user_id) VALUES (${id}, '权限迁移测试', ${userId})`;
      }
      for (const key of ["owner", "admin", "member", "viewer"]) {
        await client`INSERT INTO roles (key, name, is_system) VALUES (${key}, ${key}, TRUE)`;
      }
      const customRole = randomUUID();
      await client`INSERT INTO roles (id, organization_id, key, name, is_system) VALUES (${customRole}, ${firstOrg}, 'owner', '组织自定义角色', TRUE)`;
      await client`INSERT INTO role_permissions (role_id, permission_id) SELECT ${customRole}, id FROM permissions WHERE key='rental_bills:generate'`;
      const parentByRoute = new Map<string, number>();
      for (const [routeKey, permission] of [
        ["RentalProperties", "rental_properties:read"],
        ["RentalContracts", "rental_contracts:read"],
        ["RentalBills", "rental_bills:read"],
      ] as const) {
        const [row] =
          await client`INSERT INTO menus (organization_id, type, name, route_key, permission_code, is_external, is_visible, keep_alive) VALUES (${firstOrg}, 'menu', '自定义业务页面', ${routeKey}, ${permission}, FALSE, TRUE, TRUE) RETURNING id`;
        parentByRoute.set(routeKey as string, row?.id as number);
      }
      const [secondParent] =
        await client`INSERT INTO menus (organization_id, type, name, route_key, permission_code, is_external, is_visible, keep_alive) VALUES (${secondOrg}, 'menu', '自定义账单页面', 'RentalBills', 'rental_bills:read', FALSE, FALSE, FALSE) RETURNING id`;
      const firstBillParent = parentByRoute.get("RentalBills");
      if (!secondParent || firstBillParent === undefined) throw new Error("测试账单菜单未创建");
      await client`INSERT INTO permissions (key, name, resource, action) VALUES ('rental_period_bills:void', '自定义作废权限名称', 'rental_period_bills', 'void')`;
      await client`INSERT INTO menus (organization_id, parent_id, type, name, permission_code, sort_order) VALUES (${secondOrg}, ${secondParent.id}, 'button', '自定义作废入口', 'rental_period_bills:void', 37)`;
      await client`INSERT INTO menus (organization_id, parent_id, type, name, permission_code, sort_order) VALUES (${firstOrg}, ${firstBillParent}, 'button', '保留旧生成入口', 'rental_bills:generate', 800)`;
      const existing = await client`SELECT * FROM menus ORDER BY id`;
      const customGrants = await client`SELECT * FROM role_permissions WHERE role_id=${customRole}`;

      await applyMigrations();

      const nodes = await client`SELECT * FROM menus ORDER BY id`;
      const expected = [
        ["rental_spaces:read", "RentalProperties"],
        ["rental_charges:read", "RentalContracts"],
        ["rental_charges:update", "RentalContracts"],
        ["rental_meters:read", "RentalContracts"],
        ["rental_meters:update", "RentalContracts"],
        ["rental_period_bills:generate", "RentalBills"],
        ["rental_period_bills:void", "RentalBills"],
        ["rental_receipts:create", "RentalBills"],
        ["rental_receipts:revoke", "RentalBills"],
        ["rental_refunds:create", "RentalBills"],
        ["rental_refunds:revoke", "RentalBills"],
      ];
      for (const [permission, routeKey] of expected) {
        const found = nodes.filter(
          (node) => node.organization_id === firstOrg && node.permission_code === permission,
        );
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({
          type: "button",
          parent_id: parentByRoute.get(routeKey as string),
        });
        if (routeKey === "RentalBills") expect(found[0]?.sort_order).toBeGreaterThan(800);
      }
      expect(nodes.filter((node) => node.organization_id === secondOrg)).toHaveLength(7);
      expect(nodes.filter((node) => node.organization_id === emptyOrg)).toEqual([]);
      for (const original of existing)
        expect(nodes.find((node) => node.id === original.id)).toEqual(original);
      const [permission] =
        await client`SELECT name FROM permissions WHERE key='rental_period_bills:void'`;
      expect(permission?.name).toBe("自定义作废权限名称");
      const grants =
        await client`SELECT r.key, p.key AS permission FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.organization_id IS NULL AND p.key IN ('rental_period_bills:generate', 'rental_period_bills:void') ORDER BY r.key, p.key`;
      expect(grants.map((row) => [row.key, row.permission])).toEqual([
        ["admin", "rental_period_bills:generate"],
        ["admin", "rental_period_bills:void"],
        ["owner", "rental_period_bills:generate"],
        ["owner", "rental_period_bills:void"],
      ]);
      expect(await client`SELECT * FROM role_permissions WHERE role_id=${customRole}`).toEqual(
        customGrants,
      );
      const allGrants =
        await client`SELECT * FROM role_permissions ORDER BY role_id, permission_id`;
      await client.begin(async (transaction) => {
        await transaction.unsafe(await readFile(migrationUrl, "utf8"));
      });
      expect(await client`SELECT * FROM menus ORDER BY id`).toEqual(nodes);
      expect(await client`SELECT * FROM role_permissions ORDER BY role_id, permission_id`).toEqual(
        allGrants,
      );
    });
  });
});
