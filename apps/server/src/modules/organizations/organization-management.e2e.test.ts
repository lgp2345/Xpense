import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as tables from "../../db/schema.js";
import { seedRbac } from "../../db/seed-rbac.js";
import { createOrganizationPostgresApp } from "../../test/organization-postgres-app.js";
import { rentalTestDatabaseUrl } from "../../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../../test/rental-postgres-harness.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthRepository } from "../auth/auth.repository.js";
import { PasswordService } from "../auth/password.service.js";
import { TokenService } from "../auth/token.service.js";
import { OrganizationInitializer } from "./organization-initializer.js";

const url = rentalTestDatabaseUrl(process.env);
describe.skipIf(!url)("organization management HTTP and real transactions", () => {
  it("creates mixed owners, initializes all defaults and enforces platform/settings boundaries", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async (pg) => {
      await pg.applyMigrations();
      const { app, env } = await createOrganizationPostgresApp(pg.db);
      const logs = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
      const errors = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
      try {
        await seedRbac(pg.db, env);
        const platformId = randomUUID(),
          existingId = randomUUID(),
          disabledId = randomUUID();
        const hash = await app.get(PasswordService).hash("existing-test-password");
        await pg.db.insert(tables.users).values([
          { id: platformId, passwordHash: hash, isSuperAdmin: true },
          {
            id: existingId,
            passwordHash: hash,
            phone: "13800000002",
            initialPasswordUnchanged: false,
          },
          { id: disabledId, passwordHash: hash, phone: "13800000003", status: "disabled" },
        ]);
        const token = async (userId: string, organizationId: string | null = null) => {
          const session = await app.get(AuthRepository).createRefreshSession({
            userId,
            currentOrganizationId: organizationId,
            clientType: "app_ios",
            refreshTokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
          });
          return app
            .get(TokenService)
            .signAccessToken({ userId, sessionId: session.id, organizationId });
        };
        const admin = await token(platformId);
        const headers = { authorization: `Bearer ${admin}` };
        const input = {
          name: "新建组织",
          baseCurrency: "USD",
          owners: [
            { kind: "new", phone: "13800000001" },
            { kind: "existing", phone: "13800000002", userId: existingId, confirmed: true },
          ],
        };
        const create = await app.inject({
          method: "POST",
          url: "/api/organizations/create",
          headers,
          payload: input,
        });
        expect(create.statusCode).toBe(200);
        const org = create.json().data;
        expect(org).toMatchObject({
          name: "新建组织",
          baseCurrency: "USD",
          timezone: "Asia/Shanghai",
          contactName: null,
        });
        expect(org.owners).toHaveLength(2);
        expect(JSON.stringify(org)).not.toContain("password");
        const existing = (
          await pg.db.select().from(tables.users).where(eq(tables.users.id, existingId))
        )[0];
        expect(existing).toMatchObject({ passwordHash: hash, initialPasswordUnchanged: false });
        expect(
          await pg.db
            .select()
            .from(tables.organizationMemberships)
            .where(eq(tables.organizationMemberships.userId, platformId)),
        ).toHaveLength(0);
        expect(
          await pg.db.select().from(tables.menus).where(eq(tables.menus.organizationId, org.id)),
        ).not.toHaveLength(0);
        expect(
          await pg.db
            .select()
            .from(tables.ledgers)
            .where(eq(tables.ledgers.organizationId, org.id)),
        ).toHaveLength(1);
        expect(
          await pg.db
            .select()
            .from(tables.accounts)
            .where(eq(tables.accounts.organizationId, org.id)),
        ).toHaveLength(1);
        expect(
          await pg.db
            .select()
            .from(tables.categories)
            .where(eq(tables.categories.organizationId, org.id)),
        ).not.toHaveLength(0);
        const list = await app.inject({
          method: "GET",
          url: "/api/organizations/list?page=1&pageSize=1&name=新建",
          headers,
        });
        expect(list.statusCode).toBe(200);
        expect(list.json().data).toMatchObject({ total: 1, page: 1, pageSize: 1 });
        const candidate = await app.inject({
          method: "GET",
          url: "/api/organizations/owner-candidates/list?phone=13800000003",
          headers,
        });
        expect(candidate.json().data).toEqual({
          userId: disabledId,
          phone: "13800000003",
          email: null,
          status: "disabled",
        });
        const owner = await token(existingId, org.id),
          ownerHeaders = { authorization: `Bearer ${owner}` };
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/organizations/create",
              headers: ownerHeaders,
              payload: input,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: "GET",
              url: "/api/organizations/owner-candidates/list?phone=13800000003",
              headers: ownerHeaders,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: "GET",
              url: "/api/organizations/settings/detail",
              headers: ownerHeaders,
            })
          ).statusCode,
        ).toBe(200);
        const update = await app.inject({
          method: "POST",
          url: "/api/organizations/settings/update",
          headers: ownerHeaders,
          payload: { contactName: "  联系人  ", address: "  " },
        });
        expect(update.statusCode).toBe(200);
        expect(update.json().data).toMatchObject({ contactName: "联系人", address: null });
        for (const payload of [
          { name: org.name },
          { baseCurrency: "USD" },
          { timezone: "Asia/Shanghai" },
        ])
          expect(
            (
              await app.inject({
                method: "POST",
                url: "/api/organizations/settings/update",
                headers: ownerHeaders,
                payload,
              })
            ).statusCode,
          ).toBe(400);
        const ordinaryRole = (
          await pg.db.select().from(tables.roles).where(eq(tables.roles.key, "admin"))
        )[0];
        if (!ordinaryRole) throw new Error("缺少管理员角色");
        const ordinary = randomUUID();
        await pg.db.insert(tables.users).values({ id: ordinary, passwordHash: hash });
        await pg.db
          .insert(tables.organizationMemberships)
          .values({ organizationId: org.id, userId: ordinary, roleId: ordinaryRole.id });
        const normalHeaders = { authorization: `Bearer ${await token(ordinary, org.id)}` };
        expect(
          (
            await app.inject({
              method: "GET",
              url: "/api/organizations/settings/detail",
              headers: normalHeaders,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/organizations/create",
              headers: normalHeaders,
              payload: input,
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (await app.inject({ method: "GET", url: "/api/organizations/list" })).statusCode,
        ).toBe(401);
        for (const invalid of [
          { ...input, name: "无负责人", owners: [] },
          {
            ...input,
            name: "未确认",
            owners: [{ kind: "existing", phone: "13800000002", userId: existingId }],
          },
          { ...input, name: "重复", owners: [input.owners[0], input.owners[0]] },
        ])
          expect(
            (
              await app.inject({
                method: "POST",
                url: "/api/organizations/create",
                headers,
                payload: invalid,
              })
            ).statusCode,
          ).toBe(400);
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/organizations/create",
              headers,
              payload: {
                ...input,
                name: "停用",
                owners: [
                  { kind: "existing", phone: "13800000003", userId: disabledId, confirmed: true },
                ],
              },
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/organizations/create",
              headers,
              payload: input,
            })
          ).statusCode,
        ).toBe(409);
        for (const phase of ["initialize", "audit"]) {
          const service =
            phase === "initialize" ? app.get(OrganizationInitializer) : app.get(AuditService);
          const spy =
            phase === "initialize"
              ? vi.spyOn(service as OrganizationInitializer, "initialize")
              : vi.spyOn(service as AuditService, "appendRequired");
          spy.mockRejectedValueOnce(new Error("test organization rollback"));
          const failure = await app.inject({
            method: "POST",
            url: "/api/organizations/create",
            headers,
            payload: {
              ...input,
              name: `回滚-${phase}`,
              owners: [
                { kind: "new", phone: phase === "initialize" ? "13800000004" : "13800000005" },
              ],
            },
          });
          expect(failure.statusCode).toBe(500);
          spy.mockRestore();
          expect(
            await pg.db
              .select()
              .from(tables.organizations)
              .where(eq(tables.organizations.name, `回滚-${phase}`)),
          ).toHaveLength(0);
          expect(
            await pg.db
              .select()
              .from(tables.users)
              .where(
                eq(tables.users.phone, phase === "initialize" ? "13800000004" : "13800000005"),
              ),
          ).toHaveLength(0);
        }
        const output = JSON.stringify([logs.mock.calls, errors.mock.calls]);
        for (const sensitive of [
          "13800000001",
          "13800000002",
          "13800000003",
          "existing-test-password",
          "888888",
        ])
          expect(output).not.toContain(sensitive);
      } finally {
        logs.mockRestore();
        errors.mockRestore();
        await app.close();
      }
    });
  }, 20000);
});
