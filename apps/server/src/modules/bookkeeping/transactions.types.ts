import type { TransactionType } from "@xpense/shared";

/** 交易分页筛选的仓储输入。 */
export type TransactionListInput = {
  ledgerId?: string;
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  keyword?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

/** 列表或详情主查询返回的交易表头。 */
export type TransactionHeaderRow = {
  id: string;
  ledgerId: string;
  ledgerName: string;
  type: string;
  categoryId: string | null;
  categoryName: string | null;
  amountMinor: number;
  occurredAt: Date;
  payee: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 批量流水查询返回的账户名称与有符号金额。 */
export type TransactionMovementRow = {
  transactionId: string;
  accountId: string;
  accountName: string;
  amountMinor: number;
};

/** 组织在事务写锁保护下的记账配置。 */
export type LockedOrganizationContext = {
  baseCurrency: string;
  timezone: string;
};

/** 锁定更新前读取的当前普通交易。 */
export type LockedTransactionRecord = {
  id: string;
  ledgerId: string;
  type: TransactionType;
};

/** 创建或完整更新交易表头的持久化输入。 */
export type TransactionWriteInput = {
  id?: string;
  organizationId: string;
  ledgerId: string;
  type: TransactionType;
  categoryId: string | null;
  amountMinor: number;
  occurredAt: Date;
  occurredOn: string;
  payee: string | null;
  note: string | null;
  actorUserId: string;
};

/** 软删除交易的持久化输入。 */
export type SoftDeleteTransactionInput = {
  id: string;
  organizationId: string;
  deletedByUserId: string;
};
