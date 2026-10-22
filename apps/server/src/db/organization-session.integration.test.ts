import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { AuditRepository } from "../modules/audit/audit.repository.js";
import { AuditService } from "../modules/audit/audit.service.js";
import { AuthRepository } from "../modules/auth/auth.repository.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { TokenService } from "../modules/auth/token.service.js";
import { AccessRepository } from "../modules/iam/access.repository.js";
import { AccessService } from "../modules/iam/access.service.js";
import { OrganizationsRepository } from "../modules/organizations/organizations.repository.js";
import { OrganizationsService } from "../modules/organizations/organizations.service.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import { DatabaseTransactionService } from "./database-transaction.service.js";
import * as tables from "./schema.js";

const url = rentalTestDatabaseUrl(process.env);
describe.skipIf(!url)("organization session transactions", () => {
  it("persists login/switch preference atomically and rolls back required audit failures", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ db, applyMigrations }) => {
      await applyMigrations();
      const userId = randomUUID(),
        firstId = randomUUID(),
        secondId = randomUUID(),
        roleId = randomUUID(),
        secondRoleId = randomUUID();
      await db.insert(tables.users).values({
        id: userId,
        phone: "13800000001",
        passwordHash: "test-hash",
        lastOrganizationId: firstId,
      });
      await db.insert(tables.organizations).values([
        { id: firstId, name: "事务甲", createdByUserId: userId },
        { id: secondId, name: "事务乙", createdByUserId: userId },
      ]);
      await db.insert(tables.roles).values([
        { id: roleId, key: "owner", name: "负责人", organizationId: firstId },
        { id: secondRoleId, key: "owner", name: "负责人", organizationId: secondId },
      ]);
      await db.insert(tables.organizationMemberships).values([
        { userId, organizationId: firstId, roleId, joinedAt: new Date("2026-01-01") },
        {
          userId,
          organizationId: secondId,
          roleId: secondRoleId,
          joinedAt: new Date("2026-02-01"),
        },
      ]);
      const config = {
        env: {
          JWT_ACCESS_SECRET: "isolated-test-secret-with-32-characters",
          ACCESS_TOKEN_TTL_SECONDS: 900,
          REFRESH_TOKEN_TTL_DAYS: 30,
        },
      };
      const tokens = new TokenService(config as never);
      const authRepository = new AuthRepository(db);
      const audit = new AuditService(new AuditRepository(db));
      const access = new AccessService(new AccessRepository(db));
      const transactions = new DatabaseTransactionService(db);
      const auth = new AuthService(
        authRepository,
        { verify: async () => true } as never,
        tokens,
        config as never,
        audit,
        { verify: () => true } as never,
        { assertAllowed: () => {}, resetPhone: () => {} } as never,
        access,
        transactions,
      );
      const organizations = new OrganizationsService(
        new OrganizationsRepository(db),
        tokens,
        audit,
        authRepository,
        transactions,
      );
      const input = {
        phone: "13800000001",
        password: "test-password",
        captchaId: "test",
        captchaText: "test",
        clientType: "app_ios" as const,
      };
      const firstLogin = await auth.login(input);
      const otherDevice = await auth.login(input);
      const original = await access.resolveSessionContext(
        await tokens.verifyAccessToken(firstLogin.accessToken),
      );
      expect(original.organizationId).toBe(firstId);
      const failedAudit = vi
        .spyOn(audit, "appendRequired")
        .mockRejectedValueOnce(new Error("test audit failure"));
      await expect(organizations.switchCurrentOrganization(original, secondId)).rejects.toThrow(
        "test audit failure",
      );
      expect(
        (await authRepository.findActiveSessionById(original.sessionId))?.currentOrganizationId,
      ).toBe(firstId);
      expect(
        (await db.select().from(tables.users).where(eq(tables.users.id, userId)))[0]
          ?.lastOrganizationId,
      ).toBe(firstId);
      failedAudit.mockRestore();
      const switched = await organizations.switchCurrentOrganization(original, secondId);
      expect(
        (await access.resolveSessionContext(await tokens.verifyAccessToken(switched.accessToken)))
          .organizationId,
      ).toBe(secondId);
      await expect(
        access.resolveSessionContext(await tokens.verifyAccessToken(firstLogin.accessToken)),
      ).rejects.toThrow();
      expect(
        (
          await access.resolveSessionContext(
            await tokens.verifyAccessToken(otherDevice.accessToken),
          )
        ).organizationId,
      ).toBe(firstId);
      expect((await authRepository.findActiveUserByPhone(input.phone))?.defaultOrganizationId).toBe(
        secondId,
      );
      expect(
        (
          await access.resolveSessionContext(
            await tokens.verifyAccessToken((await auth.login(input)).accessToken),
          )
        ).organizationId,
      ).toBe(secondId);
      const before = await db.select().from(tables.refreshSessions);
      const failLoginAudit = vi
        .spyOn(audit, "appendRequired")
        .mockRejectedValueOnce(new Error("test login audit failure"));
      await expect(auth.login(input)).rejects.toThrow("test login audit failure");
      expect(await db.select().from(tables.refreshSessions)).toEqual(before);
      failLoginAudit.mockRestore();
    });
  });
});
