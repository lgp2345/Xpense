import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { SessionAuthContext } from "../common/auth/session-auth-context.js";
import { AuditRepository } from "../modules/audit/audit.repository.js";
import { AuditService } from "../modules/audit/audit.service.js";
import { PasswordService } from "../modules/auth/password.service.js";
import { createOrganizationSchema } from "../modules/organizations/dto/create-organization.dto.js";
import { OrganizationInitializer } from "../modules/organizations/organization-initializer.js";
import { OrganizationManagementRepository } from "../modules/organizations/organization-management.repository.js";
import { OrganizationManagementService } from "../modules/organizations/organization-management.service.js";
import { createOrganizationPostgresApp } from "../test/organization-postgres-app.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import { DatabaseTransactionService } from "./database-transaction.service.js";
import type { AppDb } from "./db.module.js";
import * as tables from "./schema.js";
import { seedRbac } from "./seed-rbac.js";

const url = rentalTestDatabaseUrl(process.env);
function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function service(db: AppDb) {
  const repository = new OrganizationManagementRepository(db);
  return {
    repository,
    service: new OrganizationManagementService(
      repository,
      new DatabaseTransactionService(db),
      new PasswordService(),
      new OrganizationInitializer(),
      new AuditService(new AuditRepository(db)),
    ),
  };
}
const context = (userId: string): SessionAuthContext => ({
  accessScope: "platform",
  userId,
  sessionId: randomUUID(),
  organizationId: null,
  isSuperAdmin: true,
  permissions: [],
});
describe.skipIf(!url)("organization creation races", () => {
  it("commits exactly one same-name creation from two independently locked admins", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async (pg) => {
      await pg.applyMigrations();
      const { app, env } = await createOrganizationPostgresApp(pg.db);
      await app.close();
      await seedRbac(pg.db, env);
      const worker = await pg.connect(),
        observer = await pg.connect();
      const actorA = randomUUID(),
        actorB = randomUUID(),
        owner = randomUUID();
      await pg.db.insert(tables.users).values([
        { id: actorA, passwordHash: "unused-hash", isSuperAdmin: true },
        { id: actorB, passwordHash: "unused-hash", isSuperAdmin: true },
        {
          id: owner,
          phone: "13800000001",
          passwordHash: "existing-hash",
          initialPasswordUnchanged: false,
        },
      ]);
      const input = createOrganizationSchema.parse({
        name: "并发唯一组织",
        baseCurrency: "CNY",
        owners: [{ kind: "existing", phone: "13800000001", userId: owner, confirmed: true }],
      });
      const a = service(pg.db),
        b = service(worker.db),
        acquired = gate(),
        release = gate(),
        secondAttempt = gate();
      const insertA = a.repository.insertOrganization.bind(a.repository),
        insertB = b.repository.insertOrganization.bind(b.repository);
      vi.spyOn(a.repository, "insertOrganization").mockImplementation(async (...args) => {
        const result = await insertA(...args);
        acquired.release();
        await release.promise;
        return result;
      });
      vi.spyOn(b.repository, "insertOrganization").mockImplementation(async (...args) => {
        secondAttempt.release();
        return insertB(...args);
      });
      const left = a.service.create(context(actorA), input).then(
        () => true,
        () => false,
      );
      await acquired.promise;
      const right = b.service.create(context(actorB), input).then(
        () => true,
        () => false,
      );
      try {
        await secondAttempt.promise;
        const deadline = Date.now() + 5000;
        for (;;) {
          const [row] = await observer.client`SELECT pg_blocking_pids(${worker.pid}) AS blockers`;
          if (row?.blockers.includes(pg.pid)) break;
          if (Date.now() > deadline) throw new Error("未观察到唯一名称竞争阻塞");
        }
      } finally {
        release.release();
      }
      expect(await Promise.all([left, right])).toEqual([true, false]);
      expect(
        await pg.db
          .select()
          .from(tables.organizations)
          .where(eq(tables.organizations.name, input.name)),
      ).toHaveLength(1);
      expect(
        (await pg.db.select().from(tables.users).where(eq(tables.users.id, owner)))[0],
      ).toMatchObject({ passwordHash: "existing-hash", initialPasswordUnchanged: false });
    });
  }, 15000);
  it("conflicts when a phone is registered after the new-owner precheck, preserving the winner's password", async () => {
    if (!url) throw new Error("隔离数据库未授权");
    await withRentalPostgres(url, async (pg) => {
      await pg.applyMigrations();
      const { app, env } = await createOrganizationPostgresApp(pg.db);
      await app.close();
      await seedRbac(pg.db, env);
      const worker = await pg.connect(),
        actor = randomUUID();
      await pg.db
        .insert(tables.users)
        .values({ id: actor, passwordHash: "unused-hash", isSuperAdmin: true });
      const a = service(pg.db),
        checked = gate(),
        release = gate();
      const insert = a.repository.insertUser.bind(a.repository);
      vi.spyOn(a.repository, "insertUser").mockImplementation(async (...args) => {
        checked.release();
        await release.promise;
        return insert(...args);
      });
      const input = createOrganizationSchema.parse({
        name: "开户竞争",
        baseCurrency: "CNY",
        owners: [{ kind: "new", phone: "13800000007" }],
      });
      const result = a.service.create(context(actor), input).then(
        () => null,
        (error) => error,
      );
      await checked.promise;
      try {
        await worker.db.insert(tables.users).values({
          phone: "13800000007",
          passwordHash: "winner-hash",
          initialPasswordUnchanged: false,
        });
      } finally {
        release.release();
      }
      expect(await result).toMatchObject({ status: 409 });
      expect(
        await pg.db
          .select()
          .from(tables.organizations)
          .where(eq(tables.organizations.name, input.name)),
      ).toHaveLength(0);
      expect(
        (await pg.db.select().from(tables.users).where(eq(tables.users.phone, "13800000007")))[0],
      ).toMatchObject({ passwordHash: "winner-hash", initialPasswordUnchanged: false });
    });
  }, 15000);
});
