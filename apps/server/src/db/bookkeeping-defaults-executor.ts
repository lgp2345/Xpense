import { and, eq, inArray, isNull, or } from "drizzle-orm";

import type { BookkeepingDefaultsExecutor } from "./bookkeeping-defaults.js";
import type { AppDbExecutor } from "./db.module.js";
import { accounts, categories, ledgers } from "./schema.js";

/**
 * 将 Drizzle 数据库或事务执行器适配为默认记账数据初始化器所需的持久化能力。
 *
 * @param db Drizzle 数据库或已开启的事务执行器。
 * @returns 可传给默认记账初始化器的执行器；legacy 名称回退查询包含软删除行。
 */
export function createBookkeepingDefaultsExecutor(db: AppDbExecutor): BookkeepingDefaultsExecutor {
  return {
    async findActiveDefaultPersonalLedger(organizationId) {
      const [ledger] = await db
        .select({ id: ledgers.id })
        .from(ledgers)
        .where(
          and(
            eq(ledgers.organizationId, organizationId),
            eq(ledgers.type, "personal"),
            eq(ledgers.isDefault, true),
            isNull(ledgers.deletedAt),
          ),
        )
        .limit(1);

      return ledger;
    },
    async insertDefaultPersonalLedger(input) {
      const [ledger] = await db
        .insert(ledgers)
        .values(input)
        .onConflictDoNothing()
        .returning({ id: ledgers.id });

      return ledger;
    },
    async findExistingDefaultAccount(input) {
      const [account] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.organizationId, input.organizationId),
            or(eq(accounts.id, input.id), eq(accounts.name, input.name)),
          ),
        )
        .limit(1);

      return account;
    },
    async insertDefaultAccount(input) {
      await db.insert(accounts).values(input).onConflictDoNothing({ target: accounts.id });
    },
    async findExistingRootCategories(input) {
      return db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(
          and(
            eq(categories.organizationId, input.organizationId),
            eq(categories.ledgerId, input.ledgerId),
            eq(categories.type, input.type),
            isNull(categories.parentId),
            or(inArray(categories.id, [...input.ids]), inArray(categories.name, [...input.names])),
          ),
        );
    },
    async insertRootCategories(inputs) {
      if (inputs.length > 0) {
        await db.insert(categories).values(inputs).onConflictDoNothing({ target: categories.id });
      }
    },
  };
}
