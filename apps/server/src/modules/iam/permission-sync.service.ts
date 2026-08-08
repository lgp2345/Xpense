import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { permissionKeys } from "@xpense/shared";

import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { permissions } from "../../db/schema.js";

@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(@Inject(DB) private readonly db: AppDb) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.syncPermissions();
    } catch (error) {
      this.logger.warn("权限码自动同步失败（可能在测试/无数据库环境中运行）", {
        error: String(error),
      });
    }
  }

  async syncPermissions(): Promise<void> {
    const values = permissionKeys.map((key) => {
      const [resource, ...actionParts] = key.split(":");

      return {
        key,
        name: key,
        resource: resource ?? key,
        action: actionParts.join("."),
        description: key,
      };
    });

    await this.db
      .insert(permissions)
      .values(values)
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          name: permissions.name,
          resource: permissions.resource,
          action: permissions.action,
          description: permissions.description,
        },
      });
  }
}
