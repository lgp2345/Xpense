/** 账本可用类型；当前开放个人账本，并为未来租赁账本保留词汇。 */
export const ledgerTypes = ["personal", "rental"] as const;

/** 账本类型。 */
export type LedgerType = (typeof ledgerTypes)[number];

/** 账户可用类型。 */
export const accountTypes = ["cash", "bank", "e_wallet", "credit_card", "other"] as const;

/** 账户类型。 */
export type AccountType = (typeof accountTypes)[number];

/** 分类可用收支类型。 */
export const categoryTypes = ["income", "expense"] as const;

/** 分类收支类型。 */
export type CategoryType = (typeof categoryTypes)[number];

/** 普通交易可用类型。 */
export const transactionTypes = ["income", "expense", "transfer"] as const;

/** 普通交易类型。 */
export type TransactionType = (typeof transactionTypes)[number];

/** 分页查询结果。 */
export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** 账本摘要。 */
export type LedgerSummary = {
  id: string;
  name: string;
  type: LedgerType;
  isDefault: boolean;
  /** ISO 8601 格式的创建时间。 */
  createdAt: string;
  /** ISO 8601 格式的更新时间。 */
  updatedAt: string;
};

/** 账户摘要；余额以组织基础币种的最小货币单位表示，必须为安全整数。 */
export type AccountSummary = {
  id: string;
  name: string;
  type: AccountType;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  /** 以组织基础币种的最小货币单位表示，必须为安全整数。 */
  balanceMinor: number;
  /** ISO 8601 格式的创建时间。 */
  createdAt: string;
  /** ISO 8601 格式的更新时间。 */
  updatedAt: string;
};

/** 两级分类树节点。 */
export type CategoryNode = {
  id: string;
  ledgerId: string;
  type: CategoryType;
  parentId: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  children: CategoryNode[];
};

/** 交易记录；金额以组织基础币种的最小货币单位表示，必须为安全整数。 */
export type TransactionRecord = {
  id: string;
  ledgerId: string;
  ledgerName: string;
  type: TransactionType;
  accountId: string;
  accountName: string;
  destinationAccountId: string | null;
  destinationAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  /** 以组织基础币种的最小货币单位表示，必须为安全整数。 */
  amountMinor: number;
  /** ISO 8601 格式的发生时间。 */
  occurredAt: string;
  payee: string | null;
  note: string | null;
  /** ISO 8601 格式的创建时间。 */
  createdAt: string;
  /** ISO 8601 格式的更新时间。 */
  updatedAt: string;
};

/** 交易分页结果。 */
export type TransactionPage = PageResult<TransactionRecord>;

/** 月度支出分类统计；金额以组织基础币种的最小货币单位表示，必须为安全整数。 */
export type MonthlyExpenseCategoryStatistics = {
  categoryId: string;
  categoryName: string;
  /** 以组织基础币种的最小货币单位表示，必须为安全整数。 */
  amountMinor: number;
  percentage: number;
};

/** 月度收支统计；所有金额以组织基础币种的最小货币单位表示，必须为安全整数。 */
export type MonthlyStatistics = {
  currency: string;
  /** 以组织基础币种的最小货币单位表示，必须为安全整数。 */
  incomeMinor: number;
  /** 以组织基础币种的最小货币单位表示，必须为安全整数。 */
  expenseMinor: number;
  /** 以组织基础币种的最小货币单位表示，必须为安全整数。 */
  netMinor: number;
  expenseCategories: MonthlyExpenseCategoryStatistics[];
};

/** 新增或更新普通交易的请求；金额以组织基础币种的最小货币单位表示，必须为安全整数。 */
export type UpsertTransactionRequest = {
  ledgerId: string;
  type: TransactionType;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  /** 以组织基础币种的最小货币单位表示，必须为安全整数。 */
  amountMinor: number;
  /** ISO 8601 格式的发生时间。 */
  occurredAt: string;
  payee?: string;
  note?: string;
};
