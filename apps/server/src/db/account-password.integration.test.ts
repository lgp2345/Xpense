import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { SessionAuthContext } from "../common/auth/session-auth-context.js";
import { AuditRepository } from "../modules/audit/audit.repository.js";
import { AuditService } from "../modules/audit/audit.service.js";
import { AccountPasswordRepository } from "../modules/auth/account-password.repository.js";
import { AccountPasswordService } from "../modules/auth/account-password.service.js";
import { AuthRepository } from "../modules/auth/auth.repository.js";
import { PasswordService } from "../modules/auth/password.service.js";
import { TokenService } from "../modules/auth/token.service.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import { DatabaseTransactionService } from "./database-transaction.service.js";
import * as tables from "./schema.js";

const url = rentalTestDatabaseUrl(process.env);
describe.skipIf(!url)("password database transactions", () => {
  it("serializes competing password changes and rolls back account/session state on audit failure", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async ({ db, applyMigrations }) => {
      await applyMigrations();
      const userId = randomUUID();
      const passwords = new PasswordService();
      const originalHash = await passwords.hash("test-original-password");
      await db.insert(tables.users).values({
        id: userId,
        username: "password-account",
        isSuperAdmin: true,
        passwordHash: originalHash,
      });
      const auth = new AuthRepository(db),
        repository = new AccountPasswordRepository(db);
      const config = {
        env: {
          JWT_ACCESS_SECRET: "isolated-password-test-secret-32-characters",
          ACCESS_TOKEN_TTL_SECONDS: 900,
          REFRESH_TOKEN_TTL_DAYS: 30,
        },
      };
      const tokens = new TokenService(config as never);
      const session = await auth.createRefreshSession({
        userId,
        currentOrganizationId: null,
        clientType: "app_ios",
        refreshTokenHash: await tokens.hashRefreshToken("test-old-refresh"),
        expiresAt: new Date(Date.now() + 86400000),
      });
      const context: SessionAuthContext = {
        accessScope: "platform",
        userId,
        sessionId: session.id,
        organizationId: null,
        isSuperAdmin: true,
        permissions: [],
      };
      const audit = new AuditService(new AuditRepository(db));
      const service = new AccountPasswordService(
        auth,
        repository,
        passwords,
        tokens,
        config as never,
        new DatabaseTransactionService(db),
        audit,
      );
      const input = {
        currentPassword: "test-original-password",
        newPassword: "test-next-password",
      };
      const failure = vi
        .spyOn(audit, "appendRequired")
        .mockRejectedValueOnce(new Error("audit failure"));
      await expect(service.changePassword(context, input)).rejects.toThrow("audit failure");
      expect(
        (await db.select().from(tables.users).where(eq(tables.users.id, userId)))[0],
      ).toMatchObject({ passwordHash: originalHash, initialPasswordUnchanged: true });
      expect((await auth.findActiveSessionById(session.id))?.status).toBe("active");
      failure.mockRestore();
      const attempts = await Promise.allSettled([
        service.changePassword(context, input),
        service.changePassword(context, input),
      ]);
      expect(attempts.filter((value) => value.status === "fulfilled")).toHaveLength(1);
      const [user] = await db.select().from(tables.users).where(eq(tables.users.id, userId));
      if (!user) throw new Error("Missing fixture user");
      expect(await passwords.verify(user.passwordHash, input.newPassword)).toBe(true);
      expect(user.initialPasswordUnchanged).toBe(false);
      expect(await auth.findActiveSessionById(session.id)).toBeNull();
      expect(
        await auth.findActiveSessionByRefreshTokenHash(
          await tokens.hashRefreshToken("test-old-refresh"),
        ),
      ).toBeNull();
      const sessions = await auth.listUserSessions(userId);
      expect(sessions.filter((value) => value.status === "active")).toHaveLength(1);
      expect(
        sessions.filter((value) => value.status === "active")[0]?.currentOrganizationId,
      ).toBeNull();
    });
  });
});
