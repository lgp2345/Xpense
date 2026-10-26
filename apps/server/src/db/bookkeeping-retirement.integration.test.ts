import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";

const databaseUrl = rentalTestDatabaseUrl(process.env);

describe.skipIf(!databaseUrl)("记账移除升级", () => {
  it("保留租赁房产及嵌套的其他业务菜单，只清除旧记账表与授权", async () => {
    if (!databaseUrl) throw new Error("隔离数据库未授权");
    await withRentalPostgres(databaseUrl, async (pg) => {
      await pg.applyMigrations("20261023135954_member_usernames_and_multiple_roles");
      const userId = randomUUID();
      const organizationId = randomUUID();
      const ledgerId = randomUUID();
      const propertyId = randomUUID();
      const roleId = randomUUID();
      await pg.client`
        INSERT INTO users (id, username, password_hash)
        VALUES (${userId}, 'migration-fixture', 'unused-test-hash')`;
      await pg.client`
        INSERT INTO organizations (id, name, created_by_user_id)
        VALUES (${organizationId}, ${`移除演练-${organizationId}`}, ${userId})`;
      await pg.client`
        INSERT INTO ledgers (id, organization_id, name, type, created_by_user_id)
        VALUES (${ledgerId}, ${organizationId}, '旧租赁账本', 'rental', ${userId})`;
      await pg.client`
        INSERT INTO rental_properties
          (id, organization_id, ledger_id, name, type, country_code, address_line,
           created_by_user_id, updated_by_user_id)
        VALUES (${propertyId}, ${organizationId}, ${ledgerId}, '保留房产', 'residential_unit',
          'CN', '测试地址', ${userId}, ${userId})`;
      await pg.client`
        INSERT INTO roles (id, organization_id, key, name)
        VALUES (${roleId}, ${organizationId}, 'migration-role', '迁移角色')`;
      await pg.client`
        INSERT INTO permissions (key, name, resource, action) VALUES
          ('transactions:read', '旧交易查看', 'transactions', 'read'),
          ('transactions:create', '旧交易创建', 'transactions', 'create'),
          ('rental_properties:read', '房产查看', 'rental_properties', 'read'),
          ('rental_properties:create', '房产创建', 'rental_properties', 'create')
        ON CONFLICT (key) DO NOTHING`;
      await pg.client`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT ${roleId}, id FROM permissions
        WHERE key IN ('transactions:read', 'rental_properties:read')`;

      const [directory] = await pg.client<{ id: number }[]>`
        INSERT INTO menus (organization_id, type, name, is_visible)
        VALUES (${organizationId}, 'directory', '记账管理', true) RETURNING id`;
      if (!directory) throw new Error("缺少目录测试数据");
      const [retired] = await pg.client<{ id: number }[]>`
        INSERT INTO menus (organization_id, parent_id, type, name, route_key,
          permission_code, is_external, is_visible, keep_alive)
        VALUES (${organizationId}, ${directory.id}, 'menu', '交易记录', 'Transactions',
          'transactions:read', false, true, true) RETURNING id`;
      if (!retired) throw new Error("缺少旧菜单测试数据");
      const [preserved] = await pg.client<{ id: number }[]>`
        INSERT INTO menus (organization_id, parent_id, type, name, route_key,
          permission_code, is_external, is_visible, keep_alive)
        VALUES (${organizationId}, ${retired.id}, 'menu', '房产管理', 'RentalProperties',
          'rental_properties:read', false, true, true) RETURNING id`;
      if (!preserved) throw new Error("缺少保留菜单测试数据");
      await pg.client`
        INSERT INTO menus (organization_id, parent_id, type, name, permission_code) VALUES
          (${organizationId}, ${retired.id}, 'button', '新增交易', 'transactions:create'),
          (${organizationId}, ${preserved.id}, 'button', '新增房产', 'rental_properties:create')`;

      await pg.applyMigrations();

      const tables = await pg.client<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = ${pg.schema}`;
      for (const name of ["ledgers", "accounts", "categories", "transactions", "account_movements"])
        expect(tables.map((table) => table.tablename)).not.toContain(name);
      const [property] = await pg.client`SELECT * FROM rental_properties WHERE id = ${propertyId}`;
      expect(property).toMatchObject({
        id: propertyId,
        organization_id: organizationId,
        name: "保留房产",
      });
      expect(property).not.toHaveProperty("ledger_id");
      const remainingMenus = await pg.client<
        { id: number; parent_id: number | null; name: string }[]
      >`
        SELECT id, parent_id, name FROM menus WHERE organization_id = ${organizationId} ORDER BY id`;
      expect(remainingMenus).toEqual([
        { id: preserved.id, parent_id: null, name: "房产管理" },
        { id: expect.any(Number), parent_id: preserved.id, name: "新增房产" },
      ]);
      const grants = await pg.client<{ key: string }[]>`
        SELECT permission.key FROM role_permissions grant_row
        JOIN permissions permission ON permission.id = grant_row.permission_id
        WHERE grant_row.role_id = ${roleId}`;
      expect(grants.map((grant) => grant.key)).toEqual(["rental_properties:read"]);
      expect(
        await pg.client`SELECT id FROM permissions WHERE key LIKE 'transactions:%'`,
      ).toHaveLength(0);
    });
  });
});
