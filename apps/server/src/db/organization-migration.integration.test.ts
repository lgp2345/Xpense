import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ServerEnv } from "../config/env.schema.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { insertRentalPostgresFixture } from "../test/rental-postgres-fixtures.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import { seedRbac } from "./seed-rbac.js";

const url = rentalTestDatabaseUrl(process.env);
const legacyMigration = "20261018155703_rental_finance_permission_menus";

describe.skipIf(!url)("组织管理数据迁移", () => {
  it("preserves historical credentials and bill snapshots, defaults new users, and enforces unique names and non-null emails", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ client, db, applyMigrations }) => {
      await applyMigrations(legacyMigration);
      const fixture = await insertRentalPostgresFixture(db);
      await client`UPDATE organizations SET base_currency='USD' WHERE id=${fixture.organizationId}`;
      const beforeUsers = await client`SELECT id, email, password_hash FROM users ORDER BY id`;
      const beforeOrganizations =
        await client`SELECT id, name, base_currency, timezone FROM organizations ORDER BY id`;
      const beforeBills = await client`SELECT * FROM rental_bills ORDER BY id`;
      await applyMigrations();
      expect(await client`SELECT id, email, password_hash FROM users ORDER BY id`).toEqual(
        beforeUsers,
      );
      expect(
        await client`SELECT id, name, base_currency, timezone FROM organizations ORDER BY id`,
      ).toEqual(beforeOrganizations);
      expect(await client`SELECT * FROM rental_bills ORDER BY id`).toEqual(beforeBills);
      const [historical] =
        await client`SELECT initial_password_unchanged, last_organization_id FROM users WHERE id=${fixture.userId}`;
      expect(historical).toEqual({ initial_password_unchanged: false, last_organization_id: null });
      const fresh =
        await client`INSERT INTO users (email, password_hash) VALUES (NULL, 'unused-test-hash'), (NULL, 'unused-test-hash') RETURNING email, initial_password_unchanged`;
      expect(fresh).toEqual([
        { email: null, initial_password_unchanged: true },
        { email: null, initial_password_unchanged: true },
      ]);
      await expect(
        client`INSERT INTO users (email, password_hash) VALUES (${beforeUsers[0]?.email}, 'unused-test-hash')`,
      ).rejects.toMatchObject({ code: "23505" });
      await client`UPDATE organizations SET status='disabled' WHERE id=${fixture.organizationId}`;
      await expect(
        client`INSERT INTO organizations (name, created_by_user_id) VALUES (${beforeOrganizations[0]?.name}, ${fixture.userId})`,
      ).rejects.toMatchObject({ code: "23505" });
    });
  });

  it.each([
    "duplicate",
    "whitespace",
    "unicode-whitespace",
  ])("fails explicitly for %s historical names without rewriting data", async (kind) => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ client, applyMigrations }) => {
      await applyMigrations(legacyMigration);
      const userId = randomUUID();
      await client`INSERT INTO users (id, email, password_hash) VALUES (${userId}, 'migration@example.invalid', 'unused-test-hash')`;
      const name =
        kind === "whitespace"
          ? " 未规范 "
          : kind === "unicode-whitespace"
            ? "\u3000未规范\u00a0"
            : "同名";
      await client`INSERT INTO organizations (name, created_by_user_id) VALUES (${name}, ${userId})`;
      if (kind === "duplicate")
        await client`INSERT INTO organizations (name, created_by_user_id) VALUES (${name}, ${userId})`;
      const before = await client`SELECT * FROM organizations ORDER BY id`;
      await expect(applyMigrations()).rejects.toThrow();
      expect(await client`SELECT * FROM organizations ORDER BY id`).toEqual(before);
      const columns =
        await client`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users'`;
      expect(columns.map((row) => row.column_name)).not.toContain("initial_password_unchanged");
    });
  });

  it("initializes new bootstrap users but never resets an existing password or reminder state", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ client, db, applyMigrations }) => {
      await applyMigrations();
      const env = {
        BOOTSTRAP_SUPER_ADMIN_EMAIL: "bootstrap@example.invalid",
        BOOTSTRAP_SUPER_ADMIN_PHONE: "13800000009",
        BOOTSTRAP_SUPER_ADMIN_PASSWORD: "test-bootstrap-initial",
        BOOTSTRAP_ORGANIZATION_NAME: "Bootstrap 测试",
      } as ServerEnv;
      await seedRbac(db, env);
      const [created] =
        await client`SELECT password_hash, initial_password_unchanged FROM users WHERE email=${env.BOOTSTRAP_SUPER_ADMIN_EMAIL as string}`;
      expect(created?.initial_password_unchanged).toBe(true);
      await client`UPDATE users SET initial_password_unchanged=false WHERE email=${env.BOOTSTRAP_SUPER_ADMIN_EMAIL as string}`;
      await seedRbac(db, { ...env, BOOTSTRAP_SUPER_ADMIN_PASSWORD: "test-different-initial" });
      const [existing] =
        await client`SELECT password_hash, initial_password_unchanged FROM users WHERE email=${env.BOOTSTRAP_SUPER_ADMIN_EMAIL as string}`;
      expect(existing).toEqual({
        password_hash: created?.password_hash,
        initial_password_unchanged: false,
      });
    });
  });
});
