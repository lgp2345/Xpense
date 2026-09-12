import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { permissionKeys } from "@xpense/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DB } from "../../db/db.tokens.js";
import { permissions } from "../../db/schema.js";
import { PermissionSyncService } from "./permission-sync.service.js";

type PermissionDatabaseFake = ReturnType<typeof createPermissionDatabaseFake>;

/** 创建可观察完整 upsert 调用链的权限数据库 fake。 */
function createPermissionDatabaseFake(error?: Error) {
  const onConflictDoUpdate = error
    ? vi.fn().mockRejectedValue(error)
    : vi.fn().mockResolvedValue(undefined);
  const values = vi.fn((_permissionValues: unknown) => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));

  return { insert, values, onConflictDoUpdate };
}

/** 通过 TestingModule 初始化服务，确保覆盖 Nest 生命周期调用。 */
async function initializePermissionSync(db: PermissionDatabaseFake) {
  const moduleRef = await Test.createTestingModule({
    providers: [PermissionSyncService, { provide: DB, useValue: db }],
  }).compile();
  await moduleRef.init();
  return { moduleRef, service: moduleRef.get(PermissionSyncService) };
}

describe("PermissionSyncService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upserts every permission during module initialization", async () => {
    const db = createPermissionDatabaseFake();
    const { moduleRef } = await initializePermissionSync(db);

    expect(db.insert).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalledWith(permissions);
    expect(db.values).toHaveBeenCalledWith(
      permissionKeys.map((key) => {
        const [resource, ...actionParts] = key.split(":");
        return {
          key,
          name: key,
          resource,
          action: actionParts.join("."),
          description: key,
        };
      }),
    );
    expect(db.onConflictDoUpdate).toHaveBeenCalledWith({
      target: permissions.key,
      set: {
        name: permissions.name,
        resource: permissions.resource,
        action: permissions.action,
        description: permissions.description,
      },
    });

    await moduleRef.close();
  });

  it("uses identical idempotent input when synchronization runs again", async () => {
    const db = createPermissionDatabaseFake();
    const { moduleRef, service } = await initializePermissionSync(db);
    const firstValues = db.values.mock.calls[0]?.[0];

    await service.syncPermissions();

    expect(db.values).toHaveBeenCalledTimes(2);
    expect(db.values.mock.calls[1]?.[0]).toEqual(firstValues);
    await moduleRef.close();
  });

  it("logs initialization failures without preventing module startup", async () => {
    const error = new Error("database unavailable");
    const db = createPermissionDatabaseFake(error);
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    const { moduleRef } = await initializePermissionSync(db);

    expect(warn).toHaveBeenCalledWith("权限码自动同步失败（可能在测试/无数据库环境中运行）", {
      error: String(error),
    });
    await moduleRef.close();
  });
});
