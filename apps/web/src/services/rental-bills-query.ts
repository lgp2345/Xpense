import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { ListRentalBillsQuery } from "@xpense/shared";
import type { RentalBillsApi } from "./rental-bills-api";

export function normalizeRentalBillsQuery(query: ListRentalBillsQuery): ListRentalBillsQuery {
  const { keyword, ...filters } = query;
  return {
    ...filters,
    ...(keyword?.trim() ? { keyword: keyword.trim() } : {}),
    status: query.status ?? "active",
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}
/** 组织边界包含列表、详情和合同覆盖；预览仅存在对话框内。 */
export const rentalBillsKeys = {
  root: (organizationId: string) => ["rental", organizationId, "bills"] as const,
  list: (organizationId: string, query: ListRentalBillsQuery) =>
    [...rentalBillsKeys.root(organizationId), "list", normalizeRentalBillsQuery(query)] as const,
  detail: (organizationId: string, billId: string) =>
    [...rentalBillsKeys.root(organizationId), "detail", billId] as const,
};
export const rentalBillsQueryOptions = {
  list: (api: RentalBillsApi, organizationId: string, query: ListRentalBillsQuery = {}) => {
    const normalized = normalizeRentalBillsQuery(query);
    return queryOptions({
      queryKey: rentalBillsKeys.list(organizationId, normalized),
      queryFn: () => api.listBills(normalized),
      enabled: Boolean(organizationId),
    });
  },
  detail: (api: RentalBillsApi, organizationId: string, billId: string) =>
    queryOptions({
      queryKey: rentalBillsKeys.detail(organizationId, billId),
      queryFn: () => api.getBill(billId),
      enabled: Boolean(organizationId && billId),
    }),
};
export async function invalidateRentalBills(
  queryClient: QueryClient,
  organizationId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: rentalBillsKeys.root(organizationId) });
}
