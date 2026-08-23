import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./identity.js";

/** 账本类型：个人账本或为未来租赁业务预留的租赁账本。 */
export const ledgerType = pgEnum("ledger_type", ["personal", "rental"]);

/** 账户类型。 */
export const accountType = pgEnum("account_type", [
  "cash",
  "bank",
  "e_wallet",
  "credit_card",
  "other",
]);

/** 分类收支类型。 */
export const categoryType = pgEnum("category_type", ["income", "expense"]);

/** 交易类型；排除型资金流不计入普通收支统计。 */
export const transactionType = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
  "excluded_inflow",
  "excluded_outflow",
]);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

/** 组织下的记账账本。 */
export const ledgers = snakeCase.table(
  "ledgers",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    type: ledgerType().notNull(),
    /** 标记组织当前使用的默认账本；每个组织至多一个未删除默认账本。 */
    isDefault: boolean().notNull().default(false),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    /** 软删除时间；为空表示账本仍有效。 */
    deletedAt: timestamp({ withTimezone: true }),
    deletedByUserId: uuid().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    unique("ledgers_organization_id_unique").on(table.organizationId, table.id),
    index("ledgers_organization_deleted_idx").on(table.organizationId, table.deletedAt),
    uniqueIndex("ledgers_organization_active_default_unique")
      .on(table.organizationId)
      .where(sql`${table.isDefault} IS TRUE AND ${table.deletedAt} IS NULL`),
  ],
);

/** 组织级资金账户；余额由有效账户流水汇总得到。 */
export const accounts = snakeCase.table(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    type: accountType().notNull(),
    icon: text(),
    color: text(),
    sortOrder: integer().notNull().default(0),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    /** 软删除时间；为空表示账户仍可用于新交易。 */
    deletedAt: timestamp({ withTimezone: true }),
    deletedByUserId: uuid().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    unique("accounts_organization_id_unique").on(table.organizationId, table.id),
    index("accounts_organization_deleted_sort_idx").on(
      table.organizationId,
      table.deletedAt,
      table.sortOrder,
    ),
  ],
);

/** 账本内的两级收入或支出分类。 */
export const categories = snakeCase.table(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    ledgerId: uuid().notNull(),
    type: categoryType().notNull(),
    parentId: uuid(),
    name: text().notNull(),
    icon: text(),
    color: text(),
    sortOrder: integer().notNull().default(0),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    /** 软删除时间；历史交易仍保留对已删除分类的引用。 */
    deletedAt: timestamp({ withTimezone: true }),
    deletedByUserId: uuid().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    unique("categories_organization_ledger_id_unique").on(
      table.organizationId,
      table.ledgerId,
      table.id,
    ),
    unique("categories_parent_scope_unique").on(
      table.organizationId,
      table.ledgerId,
      table.type,
      table.id,
    ),
    foreignKey({
      name: "categories_organization_ledger_fk",
      columns: [table.organizationId, table.ledgerId],
      foreignColumns: [ledgers.organizationId, ledgers.id],
    }),
    foreignKey({
      name: "categories_parent_scope_fk",
      columns: [table.organizationId, table.ledgerId, table.type, table.parentId],
      foreignColumns: [table.organizationId, table.ledgerId, table.type, table.id],
    }),
    uniqueIndex("categories_active_root_name_unique")
      .on(table.organizationId, table.ledgerId, table.type, table.name)
      .where(sql`${table.parentId} IS NULL AND ${table.deletedAt} IS NULL`),
    uniqueIndex("categories_active_child_name_unique")
      .on(table.organizationId, table.ledgerId, table.type, table.parentId, table.name)
      .where(sql`${table.parentId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    index("categories_scope_parent_deleted_idx").on(
      table.organizationId,
      table.ledgerId,
      table.type,
      table.parentId,
      table.deletedAt,
    ),
  ],
);

/** 收入、支出、转账及排除型资金流的交易主记录。 */
export const transactions = snakeCase.table(
  "transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    ledgerId: uuid().notNull(),
    type: transactionType().notNull(),
    categoryId: uuid(),
    /** 以组织基础币种最小货币单位表示的正安全整数交易金额。 */
    amountMinor: bigint({ mode: "number" }).notNull(),
    /** 交易实际发生时刻，使用带时区时间戳。 */
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    /** 按组织时区从发生时刻换算的账务日期，用于筛选和月度统计。 */
    occurredOn: date().notNull(),
    payee: text(),
    note: text(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    /** 软删除时间；非空时交易及其流水不参与余额和统计。 */
    deletedAt: timestamp({ withTimezone: true }),
    deletedByUserId: uuid().references(() => users.id),
    ...timestamps,
  },
  (table) => [
    unique("transactions_organization_id_unique").on(table.organizationId, table.id),
    foreignKey({
      name: "transactions_organization_ledger_fk",
      columns: [table.organizationId, table.ledgerId],
      foreignColumns: [ledgers.organizationId, ledgers.id],
    }),
    foreignKey({
      name: "transactions_category_scope_fk",
      columns: [table.organizationId, table.ledgerId, table.categoryId],
      foreignColumns: [categories.organizationId, categories.ledgerId, categories.id],
    }),
    check(
      "transaction_amount_minor_positive_check",
      sql`${table.amountMinor} > 0 AND ${table.amountMinor} <= 9007199254740991`,
    ),
    index("transactions_organization_occurred_idx").on(
      table.organizationId,
      table.occurredOn,
      table.occurredAt,
    ),
    index("transactions_organization_ledger_occurred_idx").on(
      table.organizationId,
      table.ledgerId,
      table.occurredOn,
    ),
    index("transactions_organization_category_occurred_idx").on(
      table.organizationId,
      table.categoryId,
      table.occurredOn,
    ),
  ],
);

/** 交易对应的账户资金方向流水。 */
export const accountMovements = snakeCase.table(
  "account_movements",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    transactionId: uuid().notNull(),
    accountId: uuid().notNull(),
    /** 以最小货币单位表示的非零有符号安全整数；正数流入账户，负数流出账户。 */
    amountMinor: bigint({ mode: "number" }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "account_movements_organization_transaction_fk",
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [transactions.organizationId, transactions.id],
    }),
    foreignKey({
      name: "account_movements_organization_account_fk",
      columns: [table.organizationId, table.accountId],
      foreignColumns: [accounts.organizationId, accounts.id],
    }),
    check(
      "account_movements_amount_minor_nonzero_check",
      sql`${table.amountMinor} <> 0 AND ${table.amountMinor} BETWEEN -9007199254740991 AND 9007199254740991`,
    ),
    index("account_movements_organization_account_transaction_idx").on(
      table.organizationId,
      table.accountId,
      table.transactionId,
    ),
  ],
);
