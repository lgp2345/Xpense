import type { AppDbTransaction } from "../db/db.module.js";
import { AccountsRepository } from "../modules/bookkeeping/accounts.repository.js";
import { BookkeepingWriteLockRepository } from "../modules/bookkeeping/bookkeeping-write-lock.repository.js";
import { CategoriesRepository } from "../modules/bookkeeping/categories.repository.js";
import { LedgersRepository } from "../modules/bookkeeping/ledgers.repository.js";
import { StatisticsRepository } from "../modules/bookkeeping/statistics.repository.js";
import { TransactionsRepository } from "../modules/bookkeeping/transactions.repository.js";
import {
  type BookkeepingTestState,
  cloneBookkeepingTestState,
  restoreBookkeepingTestState,
} from "./bookkeeping-test-state.js";

export { createBookkeepingRepositoryFakes } from "./bookkeeping-test-repositories.js";
export {
  type BookkeepingTestState,
  bookkeepingTestIds,
  bookkeepingTestRolePermissions,
  createBookkeepingTestState,
} from "./bookkeeping-test-state.js";

/** 在内存状态快照上执行事务，异常时恢复全部记账写入。 */
export function createBookkeepingTransactionService(
  state: BookkeepingTestState,
  auditLogs: unknown[],
): { run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> } {
  return {
    async run<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> {
      const snapshot = cloneBookkeepingTestState(state);
      const auditLength = auditLogs.length;
      try {
        return await operation({} as AppDbTransaction);
      } catch (error) {
        restoreBookkeepingTestState(state, snapshot);
        auditLogs.splice(auditLength);
        throw error;
      }
    },
  };
}

/** 公开生产仓储 provider token，使测试应用只替换数据库边界。 */
export const bookkeepingRepositoryTokens = {
  LedgersRepository,
  AccountsRepository,
  CategoriesRepository,
  TransactionsRepository,
  StatisticsRepository,
  BookkeepingWriteLockRepository,
};
