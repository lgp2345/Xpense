import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { ledgers } from "../../db/schema.js";
import type { LedgerRecord } from "./bookkeeping.types.js";

/** 负责账本的组织作用域只读查询。 */
@Injectable()
export class LedgersRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /**
   * 查询组织内未软删除的账本。
   * @param organizationId 当前认证组织 ID。
   * @returns 默认账本优先、随后按创建顺序排列的账本。
   */
  listActive(organizationId: string): Promise<LedgerRecord[]> {
    return this.db
      .select({
        id: ledgers.id,
        name: ledgers.name,
        type: ledgers.type,
        isDefault: ledgers.isDefault,
        createdAt: ledgers.createdAt,
        updatedAt: ledgers.updatedAt,
      })
      .from(ledgers)
      .where(and(eq(ledgers.organizationId, organizationId), isNull(ledgers.deletedAt)))
      .orderBy(desc(ledgers.isDefault), asc(ledgers.createdAt));
  }
}
