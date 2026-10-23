import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";

const url = rentalTestDatabaseUrl(process.env);

describe.skipIf(!url)("成员用户名迁移", () => {
  it("回填历史用户名且保留凭据，允许同名并拒绝缺失用户名", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ client, applyMigrations }) => {
      await applyMigrations("20261023002049_organization_settings_menus");
      const emailId = randomUUID();
      const phoneId = randomUUID();
      const emptyId = randomUUID();
      await client`INSERT INTO users (id, email, phone, password_hash) VALUES
        (${emailId}, 'member@example.invalid', NULL, 'unused-test-hash'),
        (${phoneId}, NULL, '13800000009', 'unused-test-hash'),
        (${emptyId}, NULL, NULL, 'unused-test-hash')`;
      const before = await client`SELECT id, email, phone, password_hash FROM users ORDER BY id`;
      await applyMigrations();
      expect(await client`SELECT id, email, phone, password_hash FROM users ORDER BY id`).toEqual(
        before,
      );
      const names = await client`SELECT id, username FROM users ORDER BY id`;
      expect(new Map(names.map((row) => [row.id, row.username]))).toEqual(
        new Map([
          [emailId, "member"],
          [phoneId, "13800000009"],
          [emptyId, `用户-${emptyId.slice(0, 8)}`],
        ]),
      );
      const repeated = await client`INSERT INTO users (username, password_hash) VALUES
        ('同名', 'unused-test-hash'), ('同名', 'unused-test-hash') RETURNING username`;
      expect(repeated).toHaveLength(2);
      await expect(
        client`INSERT INTO users (password_hash) VALUES ('unused-test-hash')`,
      ).rejects.toMatchObject({ code: "23502" });
    });
  });
});
