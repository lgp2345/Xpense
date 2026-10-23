import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { users } from "../../db/schema.js";
import { seedRbac } from "../../db/seed-rbac.js";
import { createOrganizationPostgresApp } from "../../test/organization-postgres-app.js";
import { rentalTestDatabaseUrl } from "../../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../../test/rental-postgres-harness.js";
import { CaptchaService } from "../auth/captcha.service.js";
import { PasswordService } from "../auth/password.service.js";

const url = rentalTestDatabaseUrl(process.env);
describe.skipIf(!url)("组织管理完整 HTTP 生命周期", () => {
  it("creates two currencies with mixed owners, changes a password, restores preference, falls back and enters as a nonmember platform admin", async () => {
    if (!url) throw Error("隔离数据库未授权");
    await withRentalPostgres(url, async (pg) => {
      await pg.applyMigrations();
      const { app, env } = await createOrganizationPostgresApp(pg.db);
      const logger = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
      const errors = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
      try {
        await seedRbac(pg.db, env);
        vi.spyOn(app.get(CaptchaService), "verify").mockReturnValue(true);
        const platformId = randomUUID(),
          existingId = randomUUID();
        const hash = await app.get(PasswordService).hash("test-existing-password");
        await pg.db.insert(users).values([
          { id: platformId, phone: "13800000006", passwordHash: hash, isSuperAdmin: true },
          {
            id: existingId,
            phone: "13800000002",
            passwordHash: hash,
            initialPasswordUnchanged: false,
          },
        ]);
        async function request(path: string, token?: string, payload?: unknown, expected = 200) {
          const response = await app.inject({
            method: payload === undefined ? "GET" : "POST",
            url: `/api${path}`,
            headers: token ? { authorization: `Bearer ${token}` } : {},
            ...(payload === undefined ? {} : { payload: payload as never }),
          });
          expect(response.statusCode, `${path}: ${response.body}`).toBe(expected);
          return response.json().data;
        }
        const login = (phone: string, password: string) =>
          request("/auth/login", undefined, {
            phone,
            password,
            captchaId: "test",
            captchaText: "test",
            clientType: "app_ios",
          });
        const platform = await login("13800000006", "test-existing-password");
        expect((await request("/user", platform.accessToken)).accessScope).toBe("platform");
        const linked = {
          kind: "existing",
          phone: "13800000002",
          userId: existingId,
          confirmed: true,
        };
        const cny = await request("/organizations/create", platform.accessToken, {
          name: "全链路人民币组织",
          baseCurrency: "CNY",
          owners: [{ kind: "new", phone: "13800000001" }, linked],
        });
        const first = cny.owners.find((owner: { phone: string }) => owner.phone === "13800000001");
        expect(first).toBeDefined();
        const usd = await request("/organizations/create", platform.accessToken, {
          name: "全链路美元组织",
          baseCurrency: "USD",
          owners: [
            { kind: "existing", phone: "13800000001", userId: first.userId, confirmed: true },
            linked,
          ],
        });
        expect(cny.owners).toHaveLength(2);
        expect(usd.owners).toHaveLength(2);
        let owner = await login("13800000001", "888888");
        expect((await request("/user", owner.accessToken)).user.initialPasswordUnchanged).toBe(
          true,
        );
        // 初始状态不阻止业务请求。
        expect(await request("/accounts/list", owner.accessToken)).toHaveLength(1);
        owner = await request("/user/current-organization", owner.accessToken, {
          organizationId: cny.id,
        });
        owner = await request("/user/current-organization", owner.accessToken, {
          organizationId: usd.id,
        });
        const stale = owner;
        owner = await request("/auth/password/update", owner.accessToken, {
          currentPassword: "888888",
          newPassword: "test-updated-password",
        });
        await request("/user", stale.accessToken, undefined, 401);
        expect((await request("/user", owner.accessToken)).user.initialPasswordUnchanged).toBe(
          false,
        );
        owner = await login("13800000001", "test-updated-password");
        expect((await request("/user", owner.accessToken)).organization.id).toBe(usd.id);
        let second = await login("13800000002", "test-existing-password");
        second = await request("/user/current-organization", second.accessToken, {
          organizationId: usd.id,
        });
        const members = await request("/members/list", second.accessToken);
        const ownerMember = members.find(
          (member: { userId: string }) => member.userId === first.userId,
        );
        const secondMember = members.find(
          (member: { userId: string }) => member.userId === existingId,
        );
        await request("/members/update", second.accessToken, {
          id: ownerMember.id,
          status: "disabled",
        });
        await request(
          "/members/update",
          second.accessToken,
          { id: secondMember.id, status: "disabled" },
          409,
        );
        owner = await login("13800000001", "test-updated-password");
        expect((await request("/user", owner.accessToken)).organization.id).toBe(cny.id);
        const entered = await request("/user/current-organization", platform.accessToken, {
          organizationId: usd.id,
        });
        const context = await request("/user", entered.accessToken);
        expect(context.role).toBeNull();
        expect(context.user.isSuperAdmin).toBe(true);
        await request(
          "/organizations/settings/update",
          entered.accessToken,
          { name: "不得更改", baseCurrency: "CNY" },
          400,
        );
        await request("/organizations/settings/update", entered.accessToken, {
          contactName: "平台维护",
          contactPhone: null,
          address: null,
        });
        const returned = await request("/auth/platform", entered.accessToken, {});
        expect((await request("/user", returned.accessToken)).accessScope).toBe("platform");
        expect(
          await pg.client`SELECT * FROM organization_memberships WHERE user_id=${platformId}`,
        ).toHaveLength(0);
      } finally {
        await app.close();
        logger.mockRestore();
        errors.mockRestore();
      }
    });
  });
});
