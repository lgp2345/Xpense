import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { bookkeepingKeys } from "./bookkeeping-query";
import type {
  ListRentalPropertiesQuery,
  ListRentalSpaceChildrenQuery,
  RentalApi,
  SearchRentalSpacesQuery,
} from "./rental-api";

export const rentalQueryRoot = ["rental"] as const;

export type NormalizedRentalPropertiesQuery = Required<
  Pick<ListRentalPropertiesQuery, "page" | "pageSize">
> &
  Omit<ListRentalPropertiesQuery, "keyword"> & { keyword?: string };

export type NormalizedRentalChildrenQuery = Required<
  Pick<ListRentalSpaceChildrenQuery, "propertyId" | "parentId" | "page" | "pageSize">
>;

export type NormalizedRentalSearchQuery = Required<
  Pick<SearchRentalSpacesQuery, "propertyId" | "keyword" | "page" | "pageSize">
>;

/** 统一规范租赁房产列表筛选，防止空白关键词造成缓存重复。 */
export function normalizeRentalPropertiesQuery(
  query: ListRentalPropertiesQuery,
): NormalizedRentalPropertiesQuery {
  const keyword = query.keyword?.trim();
  return {
    ...(keyword ? { keyword } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.province ? { province: query.province } : {}),
    ...(query.city ? { city: query.city } : {}),
    ...(query.district ? { district: query.district } : {}),
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

/** 将空间树懒加载条件扩展为稳定完整的缓存键。 */
export function normalizeRentalChildrenQuery(
  query: ListRentalSpaceChildrenQuery,
): NormalizedRentalChildrenQuery {
  return {
    propertyId: query.propertyId,
    parentId: query.parentId ?? null,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 50,
  };
}

/** 将空间搜索条件扩展为稳定完整的缓存键。 */
export function normalizeRentalSearchQuery(
  query: SearchRentalSpacesQuery,
): NormalizedRentalSearchQuery {
  return {
    propertyId: query.propertyId,
    keyword: query.keyword.trim(),
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

/** 集中生成租赁查询键；每个键均以组织边界为前缀。 */
export const rentalKeys = {
  organization: (organizationId: string) => [...rentalQueryRoot, organizationId] as const,
  propertiesRoot: (organizationId: string) =>
    [...rentalKeys.organization(organizationId), "properties"] as const,
  propertiesListRoot: (organizationId: string) =>
    [...rentalKeys.propertiesRoot(organizationId), "list"] as const,
  properties: (organizationId: string, query: ListRentalPropertiesQuery) =>
    [
      ...rentalKeys.propertiesListRoot(organizationId),
      normalizeRentalPropertiesQuery(query),
    ] as const,
  property: (organizationId: string, propertyId: string) =>
    [...rentalKeys.propertiesRoot(organizationId), "detail", propertyId] as const,
  spacesRoot: (organizationId: string, propertyId: string) =>
    [...rentalKeys.organization(organizationId), "spaces", propertyId] as const,
  childrenRoot: (organizationId: string, propertyId: string) =>
    [...rentalKeys.spacesRoot(organizationId, propertyId), "children"] as const,
  children: (organizationId: string, query: ListRentalSpaceChildrenQuery) => {
    const normalized = normalizeRentalChildrenQuery(query);
    return [...rentalKeys.childrenRoot(organizationId, normalized.propertyId), normalized] as const;
  },
  searchRoot: (organizationId: string, propertyId: string) =>
    [...rentalKeys.spacesRoot(organizationId, propertyId), "search"] as const,
  search: (organizationId: string, query: SearchRentalSpacesQuery) => {
    const normalized = normalizeRentalSearchQuery(query);
    return [...rentalKeys.searchRoot(organizationId, normalized.propertyId), normalized] as const;
  },
  space: (organizationId: string, propertyId: string, spaceId: string) =>
    [...rentalKeys.spacesRoot(organizationId, propertyId), "detail", spaceId] as const,
};

/** 集中生成租赁查询选项，以便 TanStack Query 自动合并相同请求。 */
export const rentalQueryOptions = {
  properties: (api: RentalApi, organizationId: string, query: ListRentalPropertiesQuery = {}) => {
    const normalized = normalizeRentalPropertiesQuery(query);
    return queryOptions({
      queryKey: rentalKeys.properties(organizationId, normalized),
      queryFn: () => api.listProperties(normalized),
    });
  },
  property: (api: RentalApi, organizationId: string, propertyId: string) =>
    queryOptions({
      queryKey: rentalKeys.property(organizationId, propertyId),
      queryFn: () => api.getProperty(propertyId),
    }),
  children: (api: RentalApi, organizationId: string, query: ListRentalSpaceChildrenQuery) => {
    const normalized = normalizeRentalChildrenQuery(query);
    return queryOptions({
      queryKey: rentalKeys.children(organizationId, normalized),
      queryFn: () => api.listChildren(normalized),
    });
  },
  search: (api: RentalApi, organizationId: string, query: SearchRentalSpacesQuery) => {
    const normalized = normalizeRentalSearchQuery(query);
    return queryOptions({
      queryKey: rentalKeys.search(organizationId, normalized),
      queryFn: () => api.searchSpaces(normalized),
    });
  },
};

/** 清除所有租赁组织缓存，供登录态或组织边界切换时使用。 */
export function clearRentalQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: rentalQueryRoot });
}

/** 房产写成功后刷新房产数据与其服务端伴生账本。 */
export async function invalidatePropertyMutation(
  queryClient: QueryClient,
  organizationId: string,
  propertyId?: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: rentalKeys.propertiesListRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.ledgers(organizationId) }),
    ...(propertyId
      ? [
          queryClient.invalidateQueries({
            queryKey: rentalKeys.property(organizationId, propertyId),
          }),
        ]
      : []),
  ]);
}

/** 空间写成功后只刷新该房产的树、搜索、计数和受影响节点详情。 */
export async function invalidateSpaceMutation(
  queryClient: QueryClient,
  organizationId: string,
  propertyId: string,
  spaceId?: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: rentalKeys.propertiesListRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: rentalKeys.property(organizationId, propertyId) }),
    queryClient.invalidateQueries({
      queryKey: rentalKeys.childrenRoot(organizationId, propertyId),
    }),
    queryClient.invalidateQueries({ queryKey: rentalKeys.searchRoot(organizationId, propertyId) }),
    ...(spaceId
      ? [
          queryClient.invalidateQueries({
            queryKey: rentalKeys.space(organizationId, propertyId, spaceId),
          }),
        ]
      : []),
  ]);
}

/** 房产启停会改变所属空间的有效启用状态，因此刷新该房产整个空间作用域。 */
export async function invalidatePropertyStatusMutation(
  queryClient: QueryClient,
  organizationId: string,
  propertyId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: rentalKeys.propertiesListRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: rentalKeys.property(organizationId, propertyId) }),
    queryClient.invalidateQueries({
      queryKey: rentalKeys.childrenRoot(organizationId, propertyId),
    }),
    queryClient.invalidateQueries({ queryKey: rentalKeys.searchRoot(organizationId, propertyId) }),
  ]);
}
