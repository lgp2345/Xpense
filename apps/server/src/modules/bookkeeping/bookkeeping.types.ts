import type { AccountSummary, AccountType, LedgerSummary } from "@xpense/shared";

/** 账本列表查询的数据库记录。 */
export type LedgerRecord = Omit<LedgerSummary, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
};

/** 账户持久化记录。 */
export type AccountRecord = {
  id: string;
  organizationId: string;
  name: string;
  type: AccountType;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  createdByUserId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 含派生余额的账户列表数据库记录。 */
export type AccountListRecord = Omit<AccountSummary, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
};

/** 创建账户的持久化输入。 */
export type CreateAccountInput = {
  organizationId: string;
  name: string;
  type: AccountType;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  createdByUserId: string;
};

/** 更新账户的持久化输入。 */
export type UpdateAccountInput = {
  id: string;
  organizationId: string;
  name?: string;
  type?: AccountType;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
};

/** 软删除账户的持久化输入。 */
export type SoftDeleteAccountInput = {
  id: string;
  organizationId: string;
  deletedByUserId: string;
};

/** 当前组织的默认个人账本及时区。 */
export type DefaultLedgerContext = {
  ledgerId: string;
  timezone: string;
};

/** 写入排除型期初余额交易的输入。 */
export type OpeningBalanceWriteInput = {
  organizationId: string;
  ledgerId: string;
  accountId: string;
  actorUserId: string;
  type: "excluded_inflow" | "excluded_outflow";
  amountMinor: number;
  movementAmountMinor: number;
  occurredAt: Date;
  occurredOn: string;
};
