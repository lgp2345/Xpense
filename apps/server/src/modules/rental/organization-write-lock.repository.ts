import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizations } from "../../db/schema.js";

type OrganizationLockExecutor = Pick<AppDbExecutor, "select">;

/** 构建租赁写入使用的组织行排他锁查询。 */
export function buildOrganizationWriteLockQuery(
  executor: OrganizationLockExecutor,
  organizationId: string,
) {
  return executor
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for("update")
    .limit(1);
}

/**
 * 提供租赁房产、空间和合同写操作的第一把组织锁。
 * 在同一事务中先锁组织、再锁业务行，保持既有并发顺序并避免与审计外键锁反向等待。
 */
@Injectable()
export class OrganizationWriteLockRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /**
   * 锁定组织行以串行化同组织租赁写入。
   * @param organizationId 可信认证组织 ID。
   * @param executor 当前业务写事务执行器；调用方必须显式传入同一事务。
   * @returns 组织存在且已锁定时为 true，否则为 false。
   */
  async lockOrganization(
    organizationId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [organization] = await buildOrganizationWriteLockQuery(executor, organizationId);

    return organization !== undefined;
  }
}
