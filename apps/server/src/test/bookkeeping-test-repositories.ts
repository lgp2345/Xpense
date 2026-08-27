import type { TransactionPage, TransactionRecord, TransactionType } from "@xpense/shared";

import { AccountsRepository } from "../modules/bookkeeping/accounts.repository.js";
import type {
  AccountListRecord,
  AccountRecord,
  CreateAccountInput,
  OpeningBalanceWriteInput,
  SoftDeleteAccountInput,
  UpdateAccountInput,
} from "../modules/bookkeeping/bookkeeping.types.js";
import { BookkeepingWriteLockRepository } from "../modules/bookkeeping/bookkeeping-write-lock.repository.js";
import { CategoriesRepository } from "../modules/bookkeeping/categories.repository.js";
import type {
  ActiveSiblingNameInput,
  CategoryRecord,
  CreateCategoryInput,
  SoftDeleteCategoryInput,
  UpdateCategoryInput,
} from "../modules/bookkeeping/categories.repository.types.js";
import { LedgersRepository } from "../modules/bookkeeping/ledgers.repository.js";
import type { MonthlyAggregateScope } from "../modules/bookkeeping/statistics.queries.js";
import {
  type MonthlyAggregateRow,
  StatisticsRepository,
} from "../modules/bookkeeping/statistics.repository.js";
import type { TransactionMovement } from "../modules/bookkeeping/transaction-movements.js";
import { TransactionsRepository } from "../modules/bookkeeping/transactions.repository.js";
import type {
  SoftDeleteTransactionInput,
  TransactionListInput,
  TransactionWriteInput,
} from "../modules/bookkeeping/transactions.types.js";
import { testIds } from "./auth-test-helpers.js";
import {
  type BookkeepingTestState,
  type BookkeepingTestTransaction,
  createBookkeepingTestAccount,
  createBookkeepingTestCategory,
} from "./bookkeeping-test-state.js";

/** 构造可替换生产数据库仓储的记账内存实现。 */
export function createBookkeepingRepositoryFakes(state: BookkeepingTestState) {
  return {
    ledgersRepository: createLedgersRepository(state),
    accountsRepository: createAccountsRepository(state),
    categoriesRepository: createCategoriesRepository(state),
    transactionsRepository: createTransactionsRepository(state),
    statisticsRepository: createStatisticsRepository(state),
    writeLockRepository: createWriteLockRepository(),
  };
}

/** 创建遵守组织隔离和软删除边界的账本仓储替身。 */
function createLedgersRepository(state: BookkeepingTestState): Partial<LedgersRepository> {
  return {
    listActive: async (organizationId) =>
      [...state.ledgers.values()]
        .filter((ledger) => ledger.organizationId === organizationId && ledger.deletedAt === null)
        .toSorted(
          (left, right) =>
            Number(right.isDefault) - Number(left.isDefault) ||
            left.createdAt.getTime() - right.createdAt.getTime(),
        )
        .map(({ organizationId: _organizationId, deletedAt: _deletedAt, ...ledger }) => ledger),
  };
}

/** 创建以有效交易流水派生余额的账户仓储替身。 */
function createAccountsRepository(state: BookkeepingTestState): Partial<AccountsRepository> {
  return {
    listActive: async (organizationId) => listActiveAccounts(state, organizationId),
    findActiveSummary: async (organizationId, id) =>
      listActiveAccounts(state, organizationId).find((account) => account.id === id) ?? null,
    findActiveOwnedAccount: async (organizationId, id) =>
      findActiveAccount(state, organizationId, id),
    findActiveOwnedAccountsForUpdate: async (organizationId, ids) =>
      [...new Set(ids)]
        .toSorted()
        .map((id) => findActiveAccount(state, organizationId, id))
        .filter((account): account is AccountRecord => account !== null),
    create: async (input: CreateAccountInput) => {
      const now = new Date();
      const account = createBookkeepingTestAccount(
        nextUuid("55555555-5555-4555-8555", state.nextAccountId++),
        input.organizationId,
        input.createdByUserId,
        input.name,
        now,
        input,
      );
      state.accounts.set(account.id, account);
      return account;
    },
    update: async (input: UpdateAccountInput) => {
      const current = findActiveAccount(state, input.organizationId, input.id);
      if (!current) throw new Error("Failed to update active account");
      const updated = {
        ...current,
        name: input.name ?? current.name,
        type: input.type ?? current.type,
        icon: input.icon !== undefined ? input.icon : current.icon,
        color: input.color !== undefined ? input.color : current.color,
        sortOrder: input.sortOrder ?? current.sortOrder,
        updatedAt: new Date(),
      };
      state.accounts.set(updated.id, updated);
      return updated;
    },
    softDelete: async (input: SoftDeleteAccountInput) => {
      const current = findActiveAccount(state, input.organizationId, input.id);
      if (!current) return;
      const now = new Date();
      state.accounts.set(input.id, {
        ...current,
        deletedAt: now,
        deletedByUserId: input.deletedByUserId,
        updatedAt: now,
      });
    },
    findDefaultLedgerContext: async (organizationId) => {
      const ledger = [...state.ledgers.values()].find(
        (item) =>
          item.organizationId === organizationId &&
          item.type === "personal" &&
          item.isDefault &&
          item.deletedAt === null,
      );
      return ledger ? { ledgerId: ledger.id, timezone: "Asia/Shanghai" } : null;
    },
    writeOpeningBalance: async (input: OpeningBalanceWriteInput) => {
      const id = nextUuid("77777777-7777-4777-8777", state.nextTransactionId++);
      const now = new Date();
      state.transactions.set(id, {
        id,
        organizationId: input.organizationId,
        ledgerId: input.ledgerId,
        type: input.type,
        categoryId: null,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        occurredOn: input.occurredOn,
        payee: null,
        note: null,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
        deletedAt: null,
        deletedByUserId: null,
        createdAt: now,
        updatedAt: now,
      });
      state.movements.push({
        organizationId: input.organizationId,
        transactionId: id,
        accountId: input.accountId,
        amountMinor: input.movementAmountMinor,
      });
      return id;
    },
  };
}

/** 创建保留两级结构、历史引用和组织边界的分类仓储替身。 */
function createCategoriesRepository(state: BookkeepingTestState): Partial<CategoriesRepository> {
  return {
    listActive: async (organizationId, ledgerId, type) =>
      [...state.categories.values()]
        .filter(
          (category) =>
            category.organizationId === organizationId &&
            category.ledgerId === ledgerId &&
            category.deletedAt === null &&
            (type === undefined || category.type === type),
        )
        .toSorted(compareCategories)
        .map(toCategoryTreeRecord),
    findActiveOwnedLedger: async (organizationId, id) => {
      const ledger = findActiveLedger(state, organizationId, id);
      return ledger ? { id: ledger.id, type: ledger.type } : null;
    },
    findActiveOwnedCategory: async (organizationId, id) =>
      findActiveCategory(state, organizationId, id),
    findActiveSiblingByName: async (input: ActiveSiblingNameInput) => {
      const duplicate = [...state.categories.values()].find(
        (category) =>
          category.organizationId === input.organizationId &&
          category.ledgerId === input.ledgerId &&
          category.type === input.type &&
          category.parentId === input.parentId &&
          category.name === input.name &&
          category.deletedAt === null &&
          category.id !== input.excludeId,
      );
      return duplicate ? { id: duplicate.id } : null;
    },
    hasActiveChildren: async (organizationId, parentId) =>
      [...state.categories.values()].some(
        (category) =>
          category.organizationId === organizationId &&
          category.parentId === parentId &&
          category.deletedAt === null,
      ),
    hasAnyChildren: async (organizationId, parentId) =>
      [...state.categories.values()].some(
        (category) => category.organizationId === organizationId && category.parentId === parentId,
      ),
    hasAnyTransactionReference: async (organizationId, categoryId) =>
      [...state.transactions.values()].some(
        (transaction) =>
          transaction.organizationId === organizationId && transaction.categoryId === categoryId,
      ),
    create: async (input: CreateCategoryInput) => {
      const category = createBookkeepingTestCategory({
        ...input,
        id: nextUuid("66666666-6666-4666-8666", state.nextCategoryId++),
        actorUserId: input.createdByUserId,
        createdAt: new Date(),
      });
      state.categories.set(category.id, category);
      return category;
    },
    update: async (input: UpdateCategoryInput) => {
      const current = findActiveCategory(state, input.organizationId, input.id);
      if (!current) throw new Error("Failed to update active category");
      const updated = { ...current, ...input, updatedAt: new Date() };
      state.categories.set(updated.id, updated);
      return updated;
    },
    softDelete: async (input: SoftDeleteCategoryInput) => {
      const current = findActiveCategory(state, input.organizationId, input.id);
      if (!current) return;
      const now = new Date();
      state.categories.set(input.id, {
        ...current,
        deletedAt: now,
        deletedByUserId: input.deletedByUserId,
        updatedAt: now,
      });
    },
  };
}

/** 创建支持筛选、分页、软删除及完整流水的交易仓储替身。 */
function createTransactionsRepository(
  state: BookkeepingTestState,
): Partial<TransactionsRepository> {
  return {
    list: async (organizationId, input) => listTransactions(state, organizationId, input),
    findDetail: async (organizationId, id) => toTransactionRecord(state, organizationId, id),
    findLockedOrganizationContext: async (organizationId) =>
      organizationId === testIds.organization || organizationId === testIds.otherOrganization
        ? { baseCurrency: "CNY", timezone: "Asia/Shanghai" }
        : null,
    findActiveOwnedForUpdate: async (organizationId, id) => {
      const transaction = findActiveOrdinaryTransaction(state, organizationId, id);
      return transaction ? { id: transaction.id, type: transaction.type as TransactionType } : null;
    },
    create: async (input: TransactionWriteInput, movements: TransactionMovement[]) => {
      const id = nextUuid("77777777-7777-4777-8777", state.nextTransactionId++);
      persistTransaction(state, { ...input, id }, movements);
      return id;
    },
    update: async (
      input: TransactionWriteInput & { id: string },
      movements: TransactionMovement[],
    ) => {
      const current = findActiveOrdinaryTransaction(state, input.organizationId, input.id);
      if (!current) throw new Error("Failed to update active transaction");
      state.transactions.set(input.id, {
        ...current,
        ledgerId: input.ledgerId,
        type: input.type,
        categoryId: input.categoryId,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        occurredOn: input.occurredOn,
        payee: input.payee,
        note: input.note,
        updatedByUserId: input.actorUserId,
        updatedAt: new Date(),
      });
      state.movements = state.movements.filter(
        (movement) =>
          movement.organizationId !== input.organizationId || movement.transactionId !== input.id,
      );
      appendMovements(state, input.organizationId, input.id, movements);
    },
    softDelete: async (input: SoftDeleteTransactionInput) => {
      const current = findActiveOrdinaryTransaction(state, input.organizationId, input.id);
      if (!current) return;
      const now = new Date();
      state.transactions.set(input.id, {
        ...current,
        deletedAt: now,
        deletedByUserId: input.deletedByUserId,
        updatedAt: now,
      });
    },
  };
}

/** 创建按活动收支交易聚合月度数据的统计仓储替身。 */
function createStatisticsRepository(state: BookkeepingTestState): Partial<StatisticsRepository> {
  return {
    findOrganizationCurrency: async (organizationId) =>
      organizationId === testIds.organization || organizationId === testIds.otherOrganization
        ? { baseCurrency: "CNY" }
        : null,
    findActiveOwnedLedger: async (organizationId, ledgerId) =>
      findActiveLedger(state, organizationId, ledgerId) ? { id: ledgerId } : null,
    aggregateMonthly: async (organizationId, scope) =>
      aggregateMonthly(state, organizationId, scope),
  };
}

/** 创建识别测试组织边界的记账写锁仓储替身。 */
function createWriteLockRepository(): Partial<BookkeepingWriteLockRepository> {
  return {
    lockOrganization: async (organizationId) =>
      organizationId === testIds.organization || organizationId === testIds.otherOrganization,
  };
}

/** 在组织作用域内查找未删除账本。 */
function findActiveLedger(state: BookkeepingTestState, organizationId: string, id: string) {
  const ledger = state.ledgers.get(id);
  return ledger?.organizationId === organizationId && ledger.deletedAt === null ? ledger : null;
}

/** 在组织作用域内查找未删除账户。 */
function findActiveAccount(
  state: BookkeepingTestState,
  organizationId: string,
  id: string,
): AccountRecord | null {
  const account = state.accounts.get(id);
  return account?.organizationId === organizationId && account.deletedAt === null ? account : null;
}

/** 在组织作用域内查找未删除分类。 */
function findActiveCategory(
  state: BookkeepingTestState,
  organizationId: string,
  id: string,
): CategoryRecord | null {
  const category = state.categories.get(id);
  return category?.organizationId === organizationId && category.deletedAt === null
    ? category
    : null;
}

/** 在组织作用域内查找未删除普通交易。 */
function findActiveOrdinaryTransaction(
  state: BookkeepingTestState,
  organizationId: string,
  id: string,
): BookkeepingTestTransaction | null {
  const transaction = state.transactions.get(id);
  return transaction?.organizationId === organizationId &&
    transaction.deletedAt === null &&
    isOrdinaryType(transaction.type)
    ? transaction
    : null;
}

/** 列出组织活动账户并从活动交易流水计算余额。 */
function listActiveAccounts(
  state: BookkeepingTestState,
  organizationId: string,
): AccountListRecord[] {
  return [...state.accounts.values()]
    .filter((account) => account.organizationId === organizationId && account.deletedAt === null)
    .toSorted(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime(),
    )
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      icon: account.icon,
      color: account.color,
      sortOrder: account.sortOrder,
      balanceMinor: state.movements
        .filter(
          (movement) =>
            movement.organizationId === organizationId &&
            movement.accountId === account.id &&
            state.transactions.get(movement.transactionId)?.deletedAt === null,
        )
        .reduce((total, movement) => total + movement.amountMinor, 0),
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));
}

/** 应用生产等价筛选、排序和分页规则列出普通交易。 */
function listTransactions(
  state: BookkeepingTestState,
  organizationId: string,
  input: TransactionListInput,
): TransactionPage {
  const keyword = input.keyword?.toLocaleLowerCase();
  const filtered = [...state.transactions.values()]
    .filter(
      (transaction) =>
        transaction.organizationId === organizationId &&
        transaction.deletedAt === null &&
        isOrdinaryType(transaction.type) &&
        (input.ledgerId === undefined || transaction.ledgerId === input.ledgerId) &&
        (input.categoryId === undefined || transaction.categoryId === input.categoryId) &&
        (input.type === undefined || transaction.type === input.type) &&
        (input.from === undefined || transaction.occurredOn >= input.from) &&
        (input.to === undefined || transaction.occurredOn <= input.to) &&
        (input.accountId === undefined ||
          state.movements.some(
            (movement) =>
              movement.transactionId === transaction.id && movement.accountId === input.accountId,
          )) &&
        (keyword === undefined ||
          transaction.payee?.toLocaleLowerCase().includes(keyword) ||
          transaction.note?.toLocaleLowerCase().includes(keyword)),
    )
    .toSorted(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        right.createdAt.getTime() - left.createdAt.getTime() ||
        right.id.localeCompare(left.id),
    );
  const offset = (input.page - 1) * input.pageSize;

  return {
    items: filtered
      .slice(offset, offset + input.pageSize)
      .map((transaction) => requireTransactionRecord(state, organizationId, transaction.id)),
    total: filtered.length,
    page: input.page,
    pageSize: input.pageSize,
  };
}

/** 将测试持久化状态投影为对外交易响应。 */
function toTransactionRecord(
  state: BookkeepingTestState,
  organizationId: string,
  id: string,
): TransactionRecord | null {
  const transaction = findActiveOrdinaryTransaction(state, organizationId, id);
  if (!transaction) return null;
  const ledger = state.ledgers.get(transaction.ledgerId);
  const category = transaction.categoryId ? state.categories.get(transaction.categoryId) : null;
  const movements = state.movements.filter(
    (movement) =>
      movement.organizationId === organizationId && movement.transactionId === transaction.id,
  );
  const sourceMovement =
    transaction.type === "income"
      ? movements.find((movement) => movement.amountMinor === transaction.amountMinor)
      : movements.find((movement) => movement.amountMinor === -transaction.amountMinor);
  const destinationMovement =
    transaction.type === "transfer"
      ? movements.find((movement) => movement.amountMinor === transaction.amountMinor)
      : undefined;
  const sourceAccount = sourceMovement ? state.accounts.get(sourceMovement.accountId) : null;
  const destinationAccount = destinationMovement
    ? state.accounts.get(destinationMovement.accountId)
    : null;
  if (!ledger || !sourceMovement || !sourceAccount) throw new Error("交易测试状态不完整");

  return {
    id: transaction.id,
    ledgerId: transaction.ledgerId,
    ledgerName: ledger.name,
    type: transaction.type as TransactionType,
    accountId: sourceMovement.accountId,
    accountName: sourceAccount.name,
    destinationAccountId: destinationMovement?.accountId ?? null,
    destinationAccountName: destinationAccount?.name ?? null,
    categoryId: transaction.categoryId,
    categoryName: category?.name ?? null,
    amountMinor: transaction.amountMinor,
    occurredAt: transaction.occurredAt.toISOString(),
    payee: transaction.payee,
    note: transaction.note,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

/** 读取必然存在的对外交易响应，否则暴露测试状态损坏。 */
function requireTransactionRecord(
  state: BookkeepingTestState,
  organizationId: string,
  id: string,
): TransactionRecord {
  const record = toTransactionRecord(state, organizationId, id);
  if (!record) throw new Error("交易测试记录不存在");
  return record;
}

/** 原子写入测试交易表头和对应账户流水。 */
function persistTransaction(
  state: BookkeepingTestState,
  input: TransactionWriteInput & { id: string },
  movements: TransactionMovement[],
): void {
  const now = new Date();
  state.transactions.set(input.id, {
    id: input.id,
    organizationId: input.organizationId,
    ledgerId: input.ledgerId,
    type: input.type,
    categoryId: input.categoryId,
    amountMinor: input.amountMinor,
    occurredAt: input.occurredAt,
    occurredOn: input.occurredOn,
    payee: input.payee,
    note: input.note,
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: now,
    updatedAt: now,
  });
  appendMovements(state, input.organizationId, input.id, movements);
}

/** 为指定测试交易追加组织作用域账户流水。 */
function appendMovements(
  state: BookkeepingTestState,
  organizationId: string,
  transactionId: string,
  movements: TransactionMovement[],
): void {
  state.movements.push(
    ...movements.map((movement) => ({ organizationId, transactionId, ...movement })),
  );
}

/** 按组织、月份及可选账本聚合活动收入和支出。 */
function aggregateMonthly(
  state: BookkeepingTestState,
  organizationId: string,
  scope: MonthlyAggregateScope,
): MonthlyAggregateRow[] {
  const amounts = new Map<
    string,
    { type: "income" | "expense"; categoryId: string; categoryName: string; amount: bigint }
  >();
  for (const transaction of state.transactions.values()) {
    if (
      transaction.organizationId !== organizationId ||
      transaction.deletedAt !== null ||
      (transaction.type !== "income" && transaction.type !== "expense") ||
      transaction.occurredOn < scope.firstDay ||
      transaction.occurredOn > scope.lastDay ||
      (scope.ledgerId !== undefined && transaction.ledgerId !== scope.ledgerId)
    ) {
      continue;
    }
    const category = transaction.categoryId ? state.categories.get(transaction.categoryId) : null;
    const categoryId = category?.id ?? "uncategorized";
    const categoryName = category?.name ?? "未分类";
    const key = `${transaction.type}:${categoryId}`;
    const current = amounts.get(key);
    amounts.set(key, {
      type: transaction.type,
      categoryId,
      categoryName,
      amount: (current?.amount ?? 0n) + BigInt(transaction.amountMinor),
    });
  }

  return [...amounts.values()].map((row) => ({
    type: row.type,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    amountMinor: row.amount.toString(),
  }));
}

/** 移除分类内部审计字段以供分类树服务消费。 */
function toCategoryTreeRecord(category: CategoryRecord) {
  return {
    id: category.id,
    ledgerId: category.ledgerId,
    type: category.type,
    parentId: category.parentId,
    name: category.name,
    icon: category.icon,
    color: category.color,
    sortOrder: category.sortOrder,
  };
}

/** 按生产分类列表的稳定展示顺序比较两条记录。 */
function compareCategories(left: CategoryRecord, right: CategoryRecord): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

/** 判断交易类型是否允许从普通交易 API 暴露。 */
function isOrdinaryType(type: BookkeepingTestTransaction["type"]): type is TransactionType {
  return type === "income" || type === "expense" || type === "transfer";
}

/** 根据命名空间前缀和自增值生成有效且确定的 UUID。 */
function nextUuid(prefix: string, value: number): string {
  return `${prefix}-${value.toString(16).padStart(12, "0")}`;
}
