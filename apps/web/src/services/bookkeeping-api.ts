import type {
  AccountSummary,
  AccountType,
  CategoryNode,
  CategoryType,
  LedgerSummary,
  MonthlyStatistics,
  TransactionPage,
  TransactionRecord,
  TransactionType,
  UpsertTransactionRequest,
} from "@xpense/shared";

import type { ApiClient } from "./api-client";

/** 交易列表可用筛选条件。 */
export type ListTransactionsQuery = {
  ledgerId?: string;
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/** 创建账户请求。 */
export type CreateAccountRequest = {
  name: string;
  type: AccountType;
  icon?: string;
  color?: string;
  sortOrder?: number;
  initialBalanceMinor?: number;
};

/** 更新账户请求，不包含由调用方法统一附加的账户 ID。 */
export type UpdateAccountRequest = Partial<
  Pick<CreateAccountRequest, "name" | "type" | "sortOrder">
> & {
  icon?: string | null;
  color?: string | null;
};

/** 分类列表查询。 */
export type ListCategoriesQuery = {
  ledgerId: string;
  type?: CategoryType;
};

/** 创建分类请求。 */
export type CreateCategoryRequest = {
  ledgerId: string;
  type: CategoryType;
  parentId?: string | null;
  name: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
};

/** 更新分类请求，不包含由调用方法统一附加的分类 ID。 */
export type UpdateCategoryRequest = Partial<
  Pick<CreateCategoryRequest, "ledgerId" | "type" | "parentId" | "name" | "sortOrder">
> & {
  icon?: string | null;
  color?: string | null;
};

/** 月度统计查询。 */
export type MonthlyStatisticsQuery = {
  month: string;
  ledgerId?: string;
};

/**
 * 创建记账 API 客户端。
 * @param client 已绑定认证、刷新与统一响应信封的 API 客户端。
 */
export function createBookkeepingApi(client: ApiClient) {
  return {
    listLedgers: () => client.get<LedgerSummary[]>("/ledgers/list"),
    listPersonalLedgers: async () => {
      const ledgers = await client.get<LedgerSummary[]>("/ledgers/list");
      return ledgers.filter((ledger) => ledger.type === "personal");
    },
    listAccounts: () => client.get<AccountSummary[]>("/accounts/list"),
    createAccount: (input: CreateAccountRequest) =>
      client.post<AccountSummary>("/accounts/create", input),
    updateAccount: (id: string, input: UpdateAccountRequest) =>
      client.post<AccountSummary>("/accounts/update", { id, ...input }),
    deleteAccount: (id: string) => client.post<void>("/accounts/delete", { id }),
    listCategories: (query: ListCategoriesQuery) =>
      client.get<CategoryNode[]>(`/categories/list${toCategoryQueryString(query)}`),
    createCategory: (input: CreateCategoryRequest) =>
      client.post<CategoryNode>("/categories/create", input),
    updateCategory: (id: string, input: UpdateCategoryRequest) =>
      client.post<CategoryNode>("/categories/update", { id, ...input }),
    deleteCategory: (id: string) => client.post<void>("/categories/delete", { id }),
    listTransactions: (query: ListTransactionsQuery = {}) =>
      client.get<TransactionPage>(`/transactions/list${toTransactionQueryString(query)}`),
    getTransaction: (id: string) =>
      client.get<TransactionRecord>(`/transactions/detail?id=${encodeURIComponent(id)}`),
    createTransaction: (input: UpsertTransactionRequest) =>
      client.post<TransactionRecord>("/transactions/create", input),
    updateTransaction: (id: string, input: UpsertTransactionRequest) =>
      client.post<TransactionRecord>("/transactions/update", { id, ...input }),
    deleteTransaction: (id: string) => client.post<void>("/transactions/delete", { id }),
    getMonthlyStatistics: (query: MonthlyStatisticsQuery) =>
      client.get<MonthlyStatistics>(`/statistics/monthly${toMonthlyQueryString(query)}`),
  };
}

/** 记账 API 客户端类型。 */
export type BookkeepingApi = ReturnType<typeof createBookkeepingApi>;

/** 按服务端 DTO 字段顺序序列化交易筛选条件。 */
function toTransactionQueryString(query: ListTransactionsQuery): string {
  const params = new URLSearchParams();

  appendParam(params, "ledgerId", query.ledgerId);
  appendParam(params, "accountId", query.accountId);
  appendParam(params, "categoryId", query.categoryId);
  appendParam(params, "type", query.type);
  appendParam(params, "keyword", query.keyword);
  appendParam(params, "from", query.from);
  appendParam(params, "to", query.to);
  appendParam(params, "page", query.page?.toString());
  appendParam(params, "pageSize", query.pageSize?.toString());

  return withQueryPrefix(params);
}

/** 序列化分类查询条件。 */
function toCategoryQueryString(query: ListCategoriesQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "ledgerId", query.ledgerId);
  appendParam(params, "type", query.type);
  return withQueryPrefix(params);
}

/** 序列化月度统计查询条件。 */
function toMonthlyQueryString(query: MonthlyStatisticsQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "month", query.month);
  appendParam(params, "ledgerId", query.ledgerId);
  return withQueryPrefix(params);
}

/** 仅写入存在的查询参数。 */
function appendParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) {
    params.set(key, value);
  }
}

/** 为非空查询参数增加 URL 查询前缀。 */
function withQueryPrefix(params: URLSearchParams): string {
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
