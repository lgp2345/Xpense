import { randomUUID } from "node:crypto";
import { permissionKeys } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../common/auth/auth-context.js";
import { AuditRepository } from "../modules/audit/audit.repository.js";
import { AuditService } from "../modules/audit/audit.service.js";
import { AccessRepository } from "../modules/iam/access.repository.js";
import { AccessService } from "../modules/iam/access.service.js";
import { IamRepository } from "../modules/iam/iam.repository.js";
import { IamService } from "../modules/iam/iam.service.js";
import { MenuRepository } from "../modules/iam/menu.repository.js";
import { OrganizationOwnerRepository } from "../modules/iam/organization-owner.repository.js";
import { OrganizationOwnerPolicyService } from "../modules/iam/organization-owner-policy.service.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import { DatabaseTransactionService } from "./database-transaction.service.js";
import type { AppDb } from "./db.module.js";
import * as tables from "./schema.js";

const url = rentalTestDatabaseUrl(process.env);
function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function services(db: AppDb) {
  const ownerRepository = new OrganizationOwnerRepository(db);
  const audit = new AuditService(new AuditRepository(db));
  return {
    audit,
    ownerRepository,
    service: new IamService(
      new IamRepository(db),
      audit,
      new DatabaseTransactionService(db),
      new AccessService(new AccessRepository(db)),
      new MenuRepository(db),
      new OrganizationOwnerPolicyService(ownerRepository),
    ),
  };
}
describe.skipIf(!url)("real organization owner concurrency", () => {
  it.each([
    "self",
    "other",
  ])("serializes two owners removing %s with a database blocking barrier", async (kind) => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async (pg) => {
      await pg.applyMigrations();
      const second = await pg.connect(),
        observer = await pg.connect();
      const org = randomUUID(),
        ownerRole = randomUUID(),
        adminRole = randomUUID();
      const userA = randomUUID(),
        userB = randomUUID(),
        memberA = randomUUID(),
        memberB = randomUUID();
      await pg.db.insert(tables.users).values([
        { id: userA, passwordHash: "unused-test-hash" },
        { id: userB, passwordHash: "unused-test-hash" },
      ]);
      await pg.db
        .insert(tables.organizations)
        .values({ id: org, name: `并发组织-${org}`, createdByUserId: userA });
      await pg.db.insert(tables.roles).values([
        { id: ownerRole, organizationId: org, key: "owner", name: "负责人", isSystem: true },
        { id: adminRole, organizationId: org, key: "admin", name: "管理员", isSystem: true },
      ]);
      await pg.db.insert(tables.organizationMemberships).values([
        { id: memberA, organizationId: org, userId: userA, roleId: ownerRole },
        { id: memberB, organizationId: org, userId: userB, roleId: ownerRole },
      ]);
      const context = (userId: string): AuthContext => ({
        userId,
        sessionId: randomUUID(),
        organizationId: org,
        isSuperAdmin: false,
        permissions: [...permissionKeys],
      });
      const a = services(pg.db),
        b = services(second.db);
      const acquired = barrier(),
        release = barrier(),
        secondAttempt = barrier();
      const lockA = a.ownerRepository.lockOrganization.bind(a.ownerRepository);
      const lockB = b.ownerRepository.lockOrganization.bind(b.ownerRepository);
      vi.spyOn(a.ownerRepository, "lockOrganization").mockImplementation(async (...args) => {
        const result = await lockA(...args);
        acquired.release();
        await release.promise;
        return result;
      });
      vi.spyOn(b.ownerRepository, "lockOrganization").mockImplementation(async (...args) => {
        secondAttempt.release();
        return lockB(...args);
      });
      const left = a.service.updateMember(context(userA), {
        id: kind === "self" ? memberA : memberB,
        roleId: adminRole,
      });
      const leftResult = left.then(
        () => true,
        () => false,
      );
      await acquired.promise;
      const right = b.service.updateMember(context(userB), {
        id: kind === "self" ? memberB : memberA,
        roleId: adminRole,
      });
      const rightResult = right.then(
        () => true,
        () => false,
      );
      try {
        await secondAttempt.promise;
        const deadline = Date.now() + 5000;
        for (;;) {
          const [row] = await observer.client`SELECT pg_blocking_pids(${second.pid}) AS blockers`;
          if (row?.blockers.includes(pg.pid)) break;
          if (Date.now() > deadline) throw new Error("未观察到第二连接阻塞在组织行锁");
        }
      } finally {
        release.release();
      }
      expect(await Promise.all([leftResult, rightResult])).toEqual([true, false]);
      expect(await a.ownerRepository.countActiveOwners(org, pg.db)).toBe(1);
      const before = await pg.db.select().from(tables.organizationMemberships);
      const remaining = before.find((member) => member.roleId === ownerRole);
      const removed = before.find((member) => member.roleId === adminRole);
      if (!remaining || !removed) throw new Error("并发结果缺少负责人或已降级成员");
      vi.spyOn(a.audit, "appendRequired").mockRejectedValueOnce(new Error("required audit failed"));
      await expect(
        a.service.updateMember(context(remaining.userId), { id: removed.id, roleId: ownerRole }),
      ).rejects.toThrow("required audit failed");
      expect(await a.ownerRepository.countActiveOwners(org, pg.db)).toBe(1);
    });
  }, 15000);
});
