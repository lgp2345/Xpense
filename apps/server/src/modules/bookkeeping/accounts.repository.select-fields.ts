import { sql } from "drizzle-orm";

import { accountMovements, accounts, transactions } from "../../db/schema.js";

/** 账户持久化记录选择字段。 */
export const accountRecordFields = {
  id: accounts.id,
  organizationId: accounts.organizationId,
  name: accounts.name,
  type: accounts.type,
  icon: accounts.icon,
  color: accounts.color,
  sortOrder: accounts.sortOrder,
  createdByUserId: accounts.createdByUserId,
  deletedAt: accounts.deletedAt,
  deletedByUserId: accounts.deletedByUserId,
  createdAt: accounts.createdAt,
  updatedAt: accounts.updatedAt,
};

/** 含有效交易派生余额的账户摘要选择字段。 */
export const accountSummaryFields = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  icon: accounts.icon,
  color: accounts.color,
  sortOrder: accounts.sortOrder,
  balanceMinor:
    sql<number>`COALESCE(SUM(${accountMovements.amountMinor}) FILTER (WHERE ${transactions.deletedAt} IS NULL), 0)`.mapWith(
      Number,
    ),
  createdAt: accounts.createdAt,
  updatedAt: accounts.updatedAt,
};

/** 账户摘要聚合所需的非聚合字段。 */
export const accountSummaryGroupFields = [
  accounts.id,
  accounts.name,
  accounts.type,
  accounts.icon,
  accounts.color,
  accounts.sortOrder,
  accounts.createdAt,
  accounts.updatedAt,
] as const;
