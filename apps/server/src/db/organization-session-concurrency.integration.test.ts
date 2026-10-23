import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { AccountPasswordService } from "../modules/auth/account-password.service.js";
import { AuthRepository } from "../modules/auth/auth.repository.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { CaptchaService } from "../modules/auth/captcha.service.js";
import { PasswordService } from "../modules/auth/password.service.js";
import { TokenService } from "../modules/auth/token.service.js";
import { AccessService } from "../modules/iam/access.service.js";
import { OrganizationsService } from "../modules/organizations/organizations.service.js";
import { createOrganizationPostgresApp } from "../test/organization-postgres-app.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import * as tables from "./schema.js";
import { seedRbac } from "./seed-rbac.js";

const url = rentalTestDatabaseUrl(process.env);
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
describe.skipIf(!url)("切换、刷新与改密真实锁交错", () => {
  it.each([
    "refresh",
    "switch",
  ] as const)("password commits before blocked %s: the old session never revives", async (action) => {
    await run(action, true);
  });
  it.each([
    "refresh",
    "switch",
  ] as const)("%s commits before blocked password: stale contexts cannot overwrite a new target", async (action) => {
    await run(action, false);
  });
});
async function run(action: "refresh" | "switch", passwordFirst: boolean) {
  if (!url) throw Error("隔离数据库未授权");
  await withRentalPostgres(url, async (pg) => {
    await pg.applyMigrations();
    const peer = await pg.connect(),
      observer = await pg.connect();
    const left = await createOrganizationPostgresApp(pg.db),
      right = await createOrganizationPostgresApp(peer.db);
    try {
      await seedRbac(pg.db, left.env);
      const userId = randomUUID(),
        first = randomUUID(),
        second = randomUUID();
      const passwords = left.app.get(PasswordService);
      const originalHash = await passwords.hash("test-original-password");
      await pg.db.insert(tables.users).values({
        id: userId,
        username: "session-user",
        phone: "13800000001",
        passwordHash: originalHash,
        lastOrganizationId: first,
      });
      await pg.db.insert(tables.organizations).values([
        { id: first, name: "锁交错甲", createdByUserId: userId },
        { id: second, name: "锁交错乙", createdByUserId: userId },
      ]);
      const [owner] = await pg.db.select().from(tables.roles).where(eq(tables.roles.key, "owner"));
      if (!owner) throw Error("缺少 owner fixture");
      await pg.db.insert(tables.organizationMemberships).values([
        { userId, organizationId: first, roleId: owner.id },
        { userId, organizationId: second, roleId: owner.id },
      ]);
      vi.spyOn(left.app.get(CaptchaService), "verify").mockReturnValue(true);
      const login = await left.app.get(AuthService).login({
        phone: "13800000001",
        password: "test-original-password",
        captchaId: "test",
        captchaText: "test",
        clientType: "app_ios",
      });
      const context = await left.app
        .get(AccessService)
        .resolveSessionContext(
          await left.app.get(TokenService).verifyAccessToken(login.accessToken),
        );
      if (!login.refreshToken) throw Error("缺少测试 refresh token");
      const acquired = barrier(),
        release = barrier();
      const winnerApp = passwordFirst ? left.app : right.app;
      const repository = winnerApp.get(AuthRepository);
      const lock = repository.lockActiveUser.bind(repository);
      const spy = vi.spyOn(repository, "lockActiveUser").mockImplementation(async (...args) => {
        const row = await lock(...args);
        acquired.release();
        await release.promise;
        return row;
      });
      const password = () =>
        left.app.get(AccountPasswordService).changePassword(context, {
          currentPassword: "test-original-password",
          newPassword: "test-next-password",
        });
      const competing = () =>
        action === "refresh"
          ? right.app
              .get(AuthService)
              .refresh({ refreshToken: login.refreshToken as string, transport: "json_body" })
          : right.app.get(OrganizationsService).switchCurrentOrganization(context, second);
      const leading = passwordFirst ? password() : competing();
      const leadingResult = Promise.allSettled([leading]);
      await acquired.promise;
      const following = passwordFirst ? competing() : password();
      const followingResult = Promise.allSettled([following]);
      try {
        const waitingPid = passwordFirst ? peer.pid : pg.pid;
        const holdingPid = passwordFirst ? pg.pid : peer.pid;
        let blocked = false;
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const [row] = await observer.client`SELECT pg_blocking_pids(${waitingPid}) AS blockers`;
          if ((row?.blockers as number[]).includes(holdingPid)) {
            blocked = true;
            break;
          }
        }
        expect(blocked, "数据库应证明后一个连接在用户行锁上等待").toBe(true);
      } finally {
        release.release();
        spy.mockRestore();
      }
      const [firstResult] = await leadingResult;
      const [secondResult] = await followingResult;
      expect(firstResult?.status).toBe("fulfilled");
      if (passwordFirst || action === "switch")
        expect(secondResult).toMatchObject({ status: "rejected", reason: { status: 401 } });
      else expect(secondResult?.status).toBe("fulfilled");
      const [user] = await pg.db.select().from(tables.users).where(eq(tables.users.id, userId));
      if (!passwordFirst && action === "switch") {
        expect(user?.passwordHash).toBe(originalHash);
        expect(user?.initialPasswordUnchanged).toBe(true);
        expect(user?.lastOrganizationId).toBe(second);
      } else {
        expect(user?.initialPasswordUnchanged).toBe(false);
        expect(user?.lastOrganizationId).toBe(first);
        const sessions = await left.app.get(AuthRepository).listUserSessions(userId);
        expect(sessions.filter((s) => s.status === "active")).toHaveLength(1);
        expect(
          await left.app.get(AuthRepository).findActiveSessionById(context.sessionId),
        ).toBeNull();
        await expect(
          right.app
            .get(AuthService)
            .refresh({ refreshToken: login.refreshToken, transport: "json_body" }),
        ).rejects.toMatchObject({ status: 401 });
        if (
          !passwordFirst &&
          action === "refresh" &&
          firstResult?.status === "fulfilled" &&
          "refreshToken" in firstResult.value
        ) {
          await expect(
            right.app.get(AuthService).refresh({
              refreshToken: firstResult.value.refreshToken as string,
              transport: "json_body",
            }),
          ).rejects.toMatchObject({ status: 401 });
        }
      }
    } finally {
      await left.app.close();
      await right.app.close();
    }
  });
}
