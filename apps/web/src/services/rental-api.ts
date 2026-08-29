import type {
  BatchCreateRentalSpacesRequest,
  CreateRentalPropertyRequest,
  CreateRentalSpaceRequest,
  MoveRentalSpaceRequest,
  RentalPropertyDetail,
  RentalPropertyPage,
  RentalPropertyType,
  RentalSpaceChildrenPage,
  RentalSpaceSearchPage,
  RentalSpaceSubtreeDepth,
  SetRentalPropertyStatusRequest,
  UpdateRentalPropertyRequest,
  UpdateRentalSpaceRequest,
} from "@xpense/shared";

import type { ApiClient } from "./api-client";

/** 租赁房产分页筛选，字段和服务端 ListPropertiesDto 保持一致。 */
export type ListRentalPropertiesQuery = {
  keyword?: string;
  type?: RentalPropertyType;
  isActive?: boolean;
  province?: string;
  city?: string;
  district?: string;
  page?: number;
  pageSize?: number;
};

/** 懒加载某个空间父节点的直属子节点。 */
export type ListRentalSpaceChildrenQuery = {
  propertyId: string;
  parentId?: string | null;
  page?: number;
  pageSize?: number;
};

/** 在单一房产作用域内搜索空间。 */
export type SearchRentalSpacesQuery = {
  propertyId: string;
  keyword: string;
  page?: number;
  pageSize?: number;
};

/** 读取空间当前子树的最大相对深度。 */
export type GetRentalSpaceSubtreeDepthQuery = {
  propertyId: string;
  id: string;
};

/** 服务端空间更新 DTO 支持部分字段更新。 */

/** 空间单项写操作的服务端返回。 */
export type RentalSpaceMutationResult = { id: string };

/** 批量创建空间的服务端返回。 */
export type RentalSpaceBatchMutationResult = { ids: string[] };

/** 创建租赁房产与空间的 HTTP 客户端。 */
export function createRentalApi(client: ApiClient) {
  return {
    listProperties: (query: ListRentalPropertiesQuery = {}) =>
      client.get<RentalPropertyPage>(`/rental-properties/list${toPropertiesQueryString(query)}`),
    getProperty: (id: string) =>
      client.get<RentalPropertyDetail>(`/rental-properties/detail?id=${encodeURIComponent(id)}`),
    createProperty: (input: CreateRentalPropertyRequest) =>
      client.post<RentalPropertyDetail>("/rental-properties/create", input),
    updateProperty: (input: UpdateRentalPropertyRequest) =>
      client.post<RentalPropertyDetail>("/rental-properties/update", input),
    setPropertyStatus: (input: SetRentalPropertyStatusRequest) =>
      client.post<RentalPropertyDetail>("/rental-properties/set-status", input),
    deleteProperty: (id: string) => client.post<void>("/rental-properties/delete", { id }),
    listChildren: (query: ListRentalSpaceChildrenQuery) =>
      client.get<RentalSpaceChildrenPage>(`/rental-spaces/children${toChildrenQueryString(query)}`),
    searchSpaces: (query: SearchRentalSpacesQuery) =>
      client.get<RentalSpaceSearchPage>(`/rental-spaces/search${toSearchQueryString(query)}`),
    getSpaceSubtreeDepth: (query: GetRentalSpaceSubtreeDepthQuery) =>
      client.get<RentalSpaceSubtreeDepth>(
        `/rental-spaces/subtree-depth${toSubtreeDepthQueryString(query)}`,
      ),
    createSpace: (input: CreateRentalSpaceRequest) =>
      client.post<RentalSpaceMutationResult>("/rental-spaces/create", input),
    batchCreateSpaces: (input: BatchCreateRentalSpacesRequest) =>
      client.post<RentalSpaceBatchMutationResult>("/rental-spaces/batch-create", input),
    updateSpace: (input: UpdateRentalSpaceRequest) =>
      client.post<RentalSpaceMutationResult>("/rental-spaces/update", input),
    moveSpace: (id: string, input: MoveRentalSpaceRequest) =>
      client.post<RentalSpaceMutationResult>("/rental-spaces/move", { id, ...input }),
    setSpaceStatus: (id: string, isActive: boolean) =>
      client.post<RentalSpaceMutationResult>("/rental-spaces/set-status", { id, isActive }),
    deleteSpace: (id: string) => client.post<void>("/rental-spaces/delete", { id }),
  };
}

/** 租赁 API 客户端类型。 */
export type RentalApi = ReturnType<typeof createRentalApi>;

function toPropertiesQueryString(query: ListRentalPropertiesQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "keyword", query.keyword?.trim());
  appendParam(params, "type", query.type);
  appendParam(params, "isActive", query.isActive?.toString());
  appendParam(params, "province", query.province);
  appendParam(params, "city", query.city);
  appendParam(params, "district", query.district);
  appendParam(params, "page", query.page?.toString());
  appendParam(params, "pageSize", query.pageSize?.toString());
  return withQueryPrefix(params);
}

function toChildrenQueryString(query: ListRentalSpaceChildrenQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "propertyId", query.propertyId);
  appendParam(params, "parentId", query.parentId ?? undefined);
  appendParam(params, "page", query.page?.toString());
  appendParam(params, "pageSize", query.pageSize?.toString());
  return withQueryPrefix(params);
}

function toSearchQueryString(query: SearchRentalSpacesQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "propertyId", query.propertyId);
  appendParam(params, "keyword", query.keyword.trim());
  appendParam(params, "page", query.page?.toString());
  appendParam(params, "pageSize", query.pageSize?.toString());
  return withQueryPrefix(params);
}

function toSubtreeDepthQueryString(query: GetRentalSpaceSubtreeDepthQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "propertyId", query.propertyId);
  appendParam(params, "id", query.id);
  return withQueryPrefix(params);
}

function appendParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) {
    params.set(key, value);
  }
}

function withQueryPrefix(params: URLSearchParams): string {
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
