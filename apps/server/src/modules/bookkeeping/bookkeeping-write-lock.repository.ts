import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizations } from "../../db/schema.js";

type OrganizationLockExecutor = Pick<AppDbExecutor, "select">;

/** 构建记账写入统一使用的组织行排他锁查询。 */
export function buildBookkeepingOrganizationWriteLockQuery(
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
 * 提供所有记账写操作共享的第一把组织锁。
 * 账户、分类与交易必须在同一数据库事务开始后首先获取此锁，再读取或锁定其他业务行，
 * 避免账户行与审计日志组织外键锁形成反向等待。
 */
@Injectable()
export class BookkeepingWriteLockRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /**
   * 锁定组织行以串行化同组织记账写入。
   * @param organizationId 可信认证组织 ID。
   * @param executor 当前业务写事务执行器；调用方必须显式传入同一事务。
   * @returns 组织存在且已锁定时为 true，否则为 false。
   */
  async lockOrganization(
    organizationId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [organization] = await buildBookkeepingOrganizationWriteLockQuery(
      executor,
      organizationId,
    );

    return organization !== undefined;
  }
}
