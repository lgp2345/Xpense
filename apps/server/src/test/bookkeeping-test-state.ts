import type { CategoryType, LedgerType, PermissionKey, TransactionType } from "@xpense/shared";

import type {
  AccountRecord,
  CreateAccountInput,
  LedgerRecord,
} from "../modules/bookkeeping/bookkeeping.types.js";
import type { CategoryRecord } from "../modules/bookkeeping/categories.repository.types.js";
import type { TransactionMovement } from "../modules/bookkeeping/transaction-movements.js";
import { testIds } from "./auth-test-helpers.js";

/** 启用记账 E2E 时附加到现有 owner/member/viewer 测试角色的权限。 */
export const bookkeepingTestRolePermissions = {
  owner: [
    "ledgers:read",
    "accounts:read",
    "accounts:create",
    "accounts:update",
    "accounts:delete",
    "categories:read",
    "categories:create",
    "categories:update",
    "categories:delete",
    "transactions:read",
    "transactions:create",
    "transactions:update",
    "transactions:delete",
    "statistics:read",
  ],
  member: [
    "ledgers:read",
    "accounts:read",
    "categories:read",
    "transactions:read",
    "transactions:create",
    "transactions:update",
    "statistics:read",
  ],
  viewer: [
    "ledgers:read",
    "accounts:read",
    "categories:read",
    "transactions:read",
    "statistics:read",
  ],
} as const satisfies Record<"member" | "owner" | "viewer", readonly PermissionKey[]>;

/** 带组织和软删除字段的测试账本记录。 */
export type BookkeepingTestLedger = LedgerRecord & {
  organizationId: string;
  deletedAt: Date | null;
};

/** 带组织和交易归属的测试账户流水。 */
export type BookkeepingTestMovement = TransactionMovement & {
  organizationId: string;
  transactionId: string;
};

/** 同时承载普通交易和内部期初余额交易的测试表头。 */
export type BookkeepingTestTransaction = {
  id: string;
  organizationId: string;
  ledgerId: string;
  type: TransactionType | "excluded_inflow" | "excluded_outflow";
  categoryId: string | null;
  amountMinor: number;
  occurredAt: Date;
  occurredOn: string;
  payee: string | null;
  note: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 记账 E2E 使用的稳定跨组织资源 ID。 */
export const bookkeepingTestIds = {
  ledger: "44444444-4444-4444-8444-444444444401",
  account: "55555555-5555-4555-8555-555555555501",
  incomeCategory: "66666666-6666-4666-8666-666666666601",
  expenseCategory: "66666666-6666-4666-8666-666666666602",
  transaction: "77777777-7777-4777-8777-777777777701",
  otherLedger: "44444444-4444-4444-8444-444444444402",
  otherAccount: "55555555-5555-4555-8555-555555555502",
  otherIncomeCategory: "66666666-6666-4666-8666-666666666603",
  otherTransaction: "77777777-7777-4777-8777-777777777702",
} as const;

/** 测试应用中由内存仓储持有的记账聚合状态。 */
export type BookkeepingTestState = {
  ledgers: Map<string, BookkeepingTestLedger>;
  accounts: Map<string, AccountRecord>;
  categories: Map<string, CategoryRecord>;
  transactions: Map<string, BookkeepingTestTransaction>;
  movements: BookkeepingTestMovement[];
  nextAccountId: number;
  nextCategoryId: number;
  nextTransactionId: number;
};

/** 创建包含两个组织边界资源的确定性记账测试状态。 */
export function createBookkeepingTestState(): BookkeepingTestState {
  const createdAt = new Date("2026-08-01T00:00:00.000Z");
  const ledgers = new Map<string, BookkeepingTestLedger>([
    [
      bookkeepingTestIds.ledger,
      createBookkeepingTestLedger(
        bookkeepingTestIds.ledger,
        testIds.organization,
        "个人账本",
        "personal",
        true,
        createdAt,
      ),
    ],
    [
      bookkeepingTestIds.otherLedger,
      createBookkeepingTestLedger(
        bookkeepingTestIds.otherLedger,
        testIds.otherOrganization,
        "其他组织账本",
        "personal",
        true,
        createdAt,
      ),
    ],
  ]);
  const accounts = new Map<string, AccountRecord>([
    [
      bookkeepingTestIds.account,
      createBookkeepingTestAccount(
        bookkeepingTestIds.account,
        testIds.organization,
        testIds.ownerUser,
        "现金",
        createdAt,
      ),
    ],
    [
      bookkeepingTestIds.otherAccount,
      createBookkeepingTestAccount(
        bookkeepingTestIds.otherAccount,
        testIds.otherOrganization,
        testIds.outsiderUser,
        "其他组织现金",
        createdAt,
      ),
    ],
  ]);
  const categories = new Map<string, CategoryRecord>([
    [
      bookkeepingTestIds.incomeCategory,
      createBookkeepingTestCategory({
        id: bookkeepingTestIds.incomeCategory,
        organizationId: testIds.organization,
        ledgerId: bookkeepingTestIds.ledger,
        type: "income",
        name: "其他收入",
        actorUserId: testIds.ownerUser,
        createdAt,
      }),
    ],
    [
      bookkeepingTestIds.expenseCategory,
      createBookkeepingTestCategory({
        id: bookkeepingTestIds.expenseCategory,
        organizationId: testIds.organization,
        ledgerId: bookkeepingTestIds.ledger,
        type: "expense",
        name: "其他支出",
        actorUserId: testIds.ownerUser,
        createdAt,
      }),
    ],
    [
      bookkeepingTestIds.otherIncomeCategory,
      createBookkeepingTestCategory({
        id: bookkeepingTestIds.otherIncomeCategory,
        organizationId: testIds.otherOrganization,
        ledgerId: bookkeepingTestIds.otherLedger,
        type: "income",
        name: "其他组织收入",
        actorUserId: testIds.outsiderUser,
        createdAt,
      }),
    ],
  ]);
  const transactions = new Map<string, BookkeepingTestTransaction>([
    [
      bookkeepingTestIds.otherTransaction,
      createBookkeepingTestTransaction({
        id: bookkeepingTestIds.otherTransaction,
        organizationId: testIds.otherOrganization,
        ledgerId: bookkeepingTestIds.otherLedger,
        type: "income",
        categoryId: bookkeepingTestIds.otherIncomeCategory,
        amountMinor: 100,
        actorUserId: testIds.outsiderUser,
        createdAt,
      }),
    ],
  ]);

  return {
    ledgers,
    accounts,
    categories,
    transactions,
    movements: [
      {
        organizationId: testIds.otherOrganization,
        transactionId: bookkeepingTestIds.otherTransaction,
        accountId: bookkeepingTestIds.otherAccount,
        amountMinor: 100,
      },
    ],
    nextAccountId: 1,
    nextCategoryId: 1,
    nextTransactionId: 1,
  };
}

/** 创建一条测试账本持久化记录。 */
export function createBookkeepingTestLedger(
  id: string,
  organizationId: string,
  name: string,
  type: LedgerType,
  isDefault: boolean,
  createdAt: Date,
): BookkeepingTestLedger {
  return {
    id,
    organizationId,
    name,
    type,
    isDefault,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

/** 创建一条测试账户持久化记录。 */
export function createBookkeepingTestAccount(
  id: string,
  organizationId: string,
  actorUserId: string,
  name: string,
  createdAt: Date,
  input: Partial<CreateAccountInput> = {},
): AccountRecord {
  return {
    id,
    organizationId,
    name,
    type: input.type ?? "cash",
    icon: input.icon ?? null,
    color: input.color ?? null,
    sortOrder: input.sortOrder ?? 0,
    createdByUserId: actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

/** 创建一条测试分类持久化记录。 */
export function createBookkeepingTestCategory(input: {
  id: string;
  organizationId: string;
  ledgerId: string;
  type: CategoryType;
  parentId?: string | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  actorUserId: string;
  createdAt: Date;
}): CategoryRecord {
  return {
    id: input.id,
    organizationId: input.organizationId,
    ledgerId: input.ledgerId,
    type: input.type,
    parentId: input.parentId ?? null,
    name: input.name,
    icon: input.icon ?? null,
    color: input.color ?? null,
    sortOrder: input.sortOrder ?? 0,
    createdByUserId: input.actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

/** 创建一条测试交易表头记录。 */
export function createBookkeepingTestTransaction(input: {
  id: string;
  organizationId: string;
  ledgerId: string;
  type: TransactionType;
  categoryId: string | null;
  amountMinor: number;
  actorUserId: string;
  createdAt: Date;
}): BookkeepingTestTransaction {
  return {
    ...input,
    occurredAt: input.createdAt,
    occurredOn: input.createdAt.toISOString().slice(0, 10),
    payee: null,
    note: null,
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    updatedAt: input.createdAt,
  };
}

/** 深复制所有可变记账集合以形成事务前快照。 */
export function cloneBookkeepingTestState(state: BookkeepingTestState): BookkeepingTestState {
  return {
    ledgers: new Map([...state.ledgers].map(([id, value]) => [id, { ...value }])),
    accounts: new Map([...state.accounts].map(([id, value]) => [id, { ...value }])),
    categories: new Map([...state.categories].map(([id, value]) => [id, { ...value }])),
    transactions: new Map([...state.transactions].map(([id, value]) => [id, { ...value }])),
    movements: state.movements.map((movement) => ({ ...movement })),
    nextAccountId: state.nextAccountId,
    nextCategoryId: state.nextCategoryId,
    nextTransactionId: state.nextTransactionId,
  };
}

/** 将记账状态原位恢复到事务前快照。 */
export function restoreBookkeepingTestState(
  state: BookkeepingTestState,
  snapshot: BookkeepingTestState,
): void {
  replaceMap(state.ledgers, snapshot.ledgers);
  replaceMap(state.accounts, snapshot.accounts);
  replaceMap(state.categories, snapshot.categories);
  replaceMap(state.transactions, snapshot.transactions);
  state.movements = snapshot.movements;
  state.nextAccountId = snapshot.nextAccountId;
  state.nextCategoryId = snapshot.nextCategoryId;
  state.nextTransactionId = snapshot.nextTransactionId;
}

/** 原位替换 Map 内容，保持仓储已捕获的状态引用有效。 */
function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, value);
}
