import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { bookkeepingKeys } from "./bookkeeping-query";
import type {
  ListRentalContractsQuery,
  ListRentalPropertiesQuery,
  ListRentalSpaceChildrenQuery,
  ListRentalTenantsQuery,
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

export type NormalizedRentalTenantsQuery = Required<
  Pick<ListRentalTenantsQuery, "page" | "pageSize">
> &
  Omit<ListRentalTenantsQuery, "keyword"> & { keyword?: string };

export type NormalizedRentalContractsQuery = Required<
  Pick<ListRentalContractsQuery, "page" | "pageSize">
> &
  Omit<ListRentalContractsQuery, "keyword"> & { keyword?: string };

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

/** 统一规范租户列表筛选，保留证件号原值交给服务端规范化。 */
export function normalizeRentalTenantsQuery(
  query: ListRentalTenantsQuery,
): NormalizedRentalTenantsQuery {
  const keyword = query.keyword?.trim();
  return {
    ...(keyword ? { keyword } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.documentCountryCode !== undefined
      ? { documentCountryCode: query.documentCountryCode }
      : {}),
    ...(query.documentType ? { documentType: query.documentType } : {}),
    ...(query.documentNumber !== undefined ? { documentNumber: query.documentNumber } : {}),
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

/** 统一规范合同列表筛选，日期保持组织本地的日历日字符串。 */
export function normalizeRentalContractsQuery(
  query: ListRentalContractsQuery,
): NormalizedRentalContractsQuery {
  const keyword = query.keyword?.trim();
  return {
    ...(keyword ? { keyword } : {}),
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.startDateFrom ? { startDateFrom: query.startDateFrom } : {}),
    ...(query.startDateTo ? { startDateTo: query.startDateTo } : {}),
    ...(query.endDateFrom ? { endDateFrom: query.endDateFrom } : {}),
    ...(query.endDateTo ? { endDateTo: query.endDateTo } : {}),
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
  tenantsRoot: (organizationId: string) =>
    [...rentalKeys.organization(organizationId), "tenants"] as const,
  tenants: (organizationId: string, query: ListRentalTenantsQuery) => {
    const normalized = normalizeRentalTenantsQuery(query);
    return [...rentalKeys.tenantsRoot(organizationId), normalized] as const;
  },
  tenant: (organizationId: string, tenantId: string) =>
    [...rentalKeys.tenantsRoot(organizationId), "detail", tenantId] as const,
  contractsRoot: (organizationId: string) =>
    [...rentalKeys.organization(organizationId), "contracts"] as const,
  contracts: (organizationId: string, query: ListRentalContractsQuery) => {
    const normalized = normalizeRentalContractsQuery(query);
    return [...rentalKeys.contractsRoot(organizationId), normalized] as const;
  },
  contract: (organizationId: string, contractId: string) =>
    [...rentalKeys.contractsRoot(organizationId), "detail", contractId] as const,
  contractDraft: (organizationId: string, draftId: string) =>
    [...rentalKeys.contractsRoot(organizationId), "draft", draftId] as const,
};

/** 集中生成租赁查询选项，以便 TanStack Query 自动合并相同请求。 */
export const rentalQueryOptions = {
  properties: (api: RentalApi, organizationId: string, query: ListRentalPropertiesQuery = {}) => {
    const normalized = normalizeRentalPropertiesQuery(query);
    return queryOptions({
      queryKey: rentalKeys.properties(organizationId, normalized),
      queryFn: () => api.listProperties(normalized),
      enabled: Boolean(organizationId),
    });
  },
  property: (api: RentalApi, organizationId: string, propertyId: string) =>
    queryOptions({
      queryKey: rentalKeys.property(organizationId, propertyId),
      queryFn: () => api.getProperty(propertyId),
      enabled: Boolean(organizationId && propertyId),
    }),
  children: (api: RentalApi, organizationId: string, query: ListRentalSpaceChildrenQuery) => {
    const normalized = normalizeRentalChildrenQuery(query);
    return queryOptions({
      queryKey: rentalKeys.children(organizationId, normalized),
      queryFn: () => api.listChildren(normalized),
      enabled: Boolean(organizationId),
    });
  },
  search: (api: RentalApi, organizationId: string, query: SearchRentalSpacesQuery) => {
    const normalized = normalizeRentalSearchQuery(query);
    return queryOptions({
      queryKey: rentalKeys.search(organizationId, normalized),
      queryFn: () => api.searchSpaces(normalized),
      enabled: Boolean(organizationId),
    });
  },
  tenants: (api: RentalApi, organizationId: string, query: ListRentalTenantsQuery = {}) => {
    const normalized = normalizeRentalTenantsQuery(query);
    const listTenants =
      api.listTenants ?? (() => Promise.reject(new Error("Rental tenant API unavailable")));
    return queryOptions({
      queryKey: rentalKeys.tenants(organizationId, normalized),
      queryFn: () => listTenants(normalized),
      enabled: Boolean(organizationId),
    });
  },
  tenant: (api: RentalApi, organizationId: string, tenantId: string) =>
    (() => {
      const tenantDetail =
        api.tenantDetail ?? (() => Promise.reject(new Error("Rental tenant API unavailable")));
      return queryOptions({
        queryKey: rentalKeys.tenant(organizationId, tenantId),
        queryFn: () => tenantDetail(tenantId),
        enabled: Boolean(organizationId && tenantId),
      });
    })(),
  contracts: (api: RentalApi, organizationId: string, query: ListRentalContractsQuery = {}) => {
    const normalized = normalizeRentalContractsQuery(query);
    const listContracts =
      api.listContracts ?? (() => Promise.reject(new Error("Rental contract API unavailable")));
    return queryOptions({
      queryKey: rentalKeys.contracts(organizationId, normalized),
      queryFn: () => listContracts(normalized),
      enabled: Boolean(organizationId),
    });
  },
  contract: (api: RentalApi, organizationId: string, contractId: string) =>
    (() => {
      const contractDetail =
        api.contractDetail ?? (() => Promise.reject(new Error("Rental contract API unavailable")));
      return queryOptions({
        queryKey: rentalKeys.contract(organizationId, contractId),
        queryFn: () => contractDetail(contractId),
        enabled: Boolean(organizationId && contractId),
      });
    })(),
};

/** 保存单次敏感查看结果的局部内存 seam；不写入 TanStack、URL 或持久化状态。 */
export function createEphemeralRentalReveal<T>() {
  let generation = 0;
  let disposed = false;
  let currentValue: T | undefined;
  let activeController: AbortController | undefined;

  const invalidate = (dispose: boolean) => {
    generation += 1;
    activeController?.abort();
    activeController = undefined;
    currentValue = undefined;
    disposed = dispose;
  };

  return {
    get value(): T | undefined {
      return currentValue;
    },
    reveal: async (request: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
      if (disposed) return undefined;
      const requestGeneration = ++generation;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const result = await request(controller.signal);
        if (disposed || requestGeneration !== generation || controller.signal.aborted) {
          return undefined;
        }
        currentValue = result;
        return result;
      } catch (error) {
        if (disposed || requestGeneration !== generation || controller.signal.aborted) {
          return undefined;
        }
        throw error;
      } finally {
        if (activeController === controller) activeController = undefined;
      }
    },
    abort: () => invalidate(false),
    close: () => invalidate(true),
    unmount: () => invalidate(true),
    reopen: () => {
      disposed = false;
      currentValue = undefined;
    },
    switchOrganization: () => invalidate(false),
  };
}

/** 清除所有租赁组织缓存，供登录态或组织边界切换时使用。 */
export function clearRentalQueries(queryClient: QueryClient, organizationId?: string): void {
  queryClient.removeQueries({
    queryKey: organizationId ? rentalKeys.organization(organizationId) : rentalQueryRoot,
  });
}

export async function invalidateTenantMutation(
  queryClient: QueryClient,
  organizationId: string,
  tenantId: string,
  _kind: "create" | "update" | "status" = "update",
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: rentalKeys.tenantsRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: rentalKeys.tenant(organizationId, tenantId) }),
    ...(_kind === "create"
      ? []
      : [queryClient.invalidateQueries({ queryKey: rentalKeys.contractsRoot(organizationId) })]),
  ]);
}

export async function invalidateDeletedTenantMutation(
  queryClient: QueryClient,
  organizationId: string,
  tenantId: string,
): Promise<void> {
  queryClient.removeQueries({ queryKey: rentalKeys.tenant(organizationId, tenantId) });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: rentalKeys.tenantsRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: rentalKeys.contractsRoot(organizationId) }),
  ]);
}

async function invalidatePropertyScopes(
  queryClient: QueryClient,
  organizationId: string,
  propertyIds: string[],
): Promise<void> {
  const uniquePropertyIds = [...new Set(propertyIds.filter(Boolean))];
  await Promise.all(
    uniquePropertyIds.flatMap((propertyId) => [
      queryClient.invalidateQueries({
        queryKey: rentalKeys.spacesRoot(organizationId, propertyId),
      }),
      queryClient.invalidateQueries({ queryKey: rentalKeys.property(organizationId, propertyId) }),
      queryClient.invalidateQueries({
        queryKey: rentalKeys.childrenRoot(organizationId, propertyId),
      }),
      queryClient.invalidateQueries({
        queryKey: rentalKeys.searchRoot(organizationId, propertyId),
      }),
    ]),
  );
}

export async function invalidateContractMutation(
  queryClient: QueryClient,
  organizationId: string,
  contractId: string,
  propertyIds: string[] = [],
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: rentalKeys.contractsRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: rentalKeys.contract(organizationId, contractId) }),
    invalidatePropertyScopes(queryClient, organizationId, propertyIds),
  ]);
}

export async function invalidateDeletedContractMutation(
  queryClient: QueryClient,
  organizationId: string,
  contractId: string,
  propertyIds: string[] = [],
): Promise<void> {
  queryClient.removeQueries({ queryKey: rentalKeys.contract(organizationId, contractId) });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: rentalKeys.contractsRoot(organizationId) }),
    invalidatePropertyScopes(queryClient, organizationId, propertyIds),
  ]);
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

/** 删除房产后移除其详情与空间作用域，避免后续导航复用已删除的缓存。 */
export async function invalidateDeletedPropertyMutation(
  queryClient: QueryClient,
  organizationId: string,
  propertyId: string,
): Promise<void> {
  queryClient.removeQueries({ queryKey: rentalKeys.property(organizationId, propertyId) });
  queryClient.removeQueries({ queryKey: rentalKeys.spacesRoot(organizationId, propertyId) });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: rentalKeys.propertiesListRoot(organizationId) }),
    queryClient.invalidateQueries({ queryKey: bookkeepingKeys.ledgers(organizationId) }),
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
