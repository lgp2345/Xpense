import { type QueryClient, queryOptions } from "@tanstack/react-query";

import type {
  BookkeepingApi,
  ListCategoriesQuery,
  ListTransactionsQuery,
  MonthlyStatisticsQuery,
} from "./bookkeeping-api";

/** 所有记账服务端状态的统一缓存根键。 */
export const bookkeepingQueryRoot = ["bookkeeping"] as const;

/** 规范化交易 URL 筛选，确保缓存键与实际服务端请求完全一致。 */
export function normalizeTransactionQuery(
  query: ListTransactionsQuery,
): Required<Pick<ListTransactionsQuery, "page" | "pageSize">> & ListTransactionsQuery {
  const keyword = query.keyword?.trim();
  return {
    ...(query.ledgerId ? { ledgerId: query.ledgerId } : {}),
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(keyword ? { keyword } : {}),
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

/** 集中生成全部组织隔离的记账查询键。 */
export const bookkeepingKeys = {
  organization: (organizationId: string) => [...bookkeepingQueryRoot, organizationId] as const,
  ledgers: (organizationId: string) =>
    [...bookkeepingKeys.organization(organizationId), "ledgers"] as const,
  accounts: (organizationId: string) =>
    [...bookkeepingKeys.organization(organizationId), "accounts"] as const,
  categoriesRoot: (organizationId: string) =>
    [...bookkeepingKeys.organization(organizationId), "categories"] as const,
  categories: (organizationId: string, query: ListCategoriesQuery) =>
    [...bookkeepingKeys.categoriesRoot(organizationId), query] as const,
  transactionsRoot: (organizationId: string) =>
    [...bookkeepingKeys.organization(organizationId), "transactions"] as const,
  transactions: (organizationId: string, query: ListTransactionsQuery) =>
    [
      ...bookkeepingKeys.transactionsRoot(organizationId),
      "list",
      normalizeTransactionQuery(query),
    ] as const,
  transaction: (organizationId: string, id: string) =>
    [...bookkeepingKeys.transactionsRoot(organizationId), "detail", id] as const,
  monthlyRoot: (organizationId: string) =>
    [...bookkeepingKeys.organization(organizationId), "monthly"] as const,
  monthly: (organizationId: string, query: MonthlyStatisticsQuery) =>
    [...bookkeepingKeys.monthlyRoot(organizationId), query] as const,
};

/** 集中生成带完整类型推断的记账查询选项。 */
export const bookkeepingQueryOptions = {
  ledgers: (api: BookkeepingApi, organizationId: string) =>
    queryOptions({
      queryKey: bookkeepingKeys.ledgers(organizationId),
      queryFn: () => api.listPersonalLedgers(),
    }),
  accounts: (api: BookkeepingApi, organizationId: string) =>
    queryOptions({
      queryKey: bookkeepingKeys.accounts(organizationId),
      queryFn: () => api.listAccounts(),
    }),
  categories: (api: BookkeepingApi, organizationId: string, query: ListCategoriesQuery) =>
    queryOptions({
      queryKey: bookkeepingKeys.categories(organizationId, query),
      queryFn: () => api.listCategories(query),
    }),
  transactions: (api: BookkeepingApi, organizationId: string, query: ListTransactionsQuery) => {
    const normalized = normalizeTransactionQuery(query);
    return queryOptions({
      queryKey: bookkeepingKeys.transactions(organizationId, normalized),
      queryFn: () => api.listTransactions(normalized),
    });
  },
  transaction: (api: BookkeepingApi, organizationId: string, id: string) =>
    queryOptions({
      queryKey: bookkeepingKeys.transaction(organizationId, id),
      queryFn: () => api.getTransaction(id),
    }),
  monthly: (api: BookkeepingApi, organizationId: string, query: MonthlyStatisticsQuery) =>
    queryOptions({
      queryKey: bookkeepingKeys.monthly(organizationId, query),
      queryFn: () => api.getMonthlyStatistics(query),
    }),
};

/** 移除全部组织的记账缓存，供会话身份边界变化时阻断跨组织复用。 */
export function clearBookkeepingQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: bookkeepingQueryRoot });
}

/** 交易写成功后刷新列表、账户余额与月度统计。 */
export async function invalidateTransactionMutation(
  queryClient: QueryClient,
  organizationId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.transactionsRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.accounts(organizationId) }),
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.monthlyRoot(organizationId) }),
  ]);
}

/** 分类写成功后刷新分类、交易列表与月度统计。 */
export async function invalidateCategoryMutation(
  queryClient: QueryClient,
  organizationId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.categoriesRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.transactionsRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.monthlyRoot(organizationId) }),
  ]);
}

/** 账户写成功后刷新账户余额与可能受期初余额影响的交易列表。 */
export async function invalidateAccountMutation(
  queryClient: QueryClient,
  organizationId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.accounts(organizationId) }),
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.transactionsRoot(organizationId) }),
  ]);
}
