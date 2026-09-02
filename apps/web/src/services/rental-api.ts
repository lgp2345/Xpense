import type {
  BatchCreateRentalSpacesRequest,
  CancelRentalContractRequest,
  ChangeRentalContractPartiesRequest,
  CheckRentalContractAvailabilityRequest,
  ConfirmRentalContractRequest,
  CreateRentalContractRequest,
  CreateRentalPropertyRequest,
  CreateRentalSpaceRequest,
  CreateRentalTenantRequest,
  DeleteRentalContractRequest,
  DeleteRentalTenantRequest,
  MoveRentalSpaceRequest,
  RenewRentalContractRequest,
  RentalContractAvailability,
  RentalContractDetail,
  RentalContractDetailQuery,
  RentalContractPage,
  RentalContractPartySensitiveDetail,
  RentalPropertyDetail,
  RentalPropertyPage,
  RentalPropertyType,
  RentalSpaceChildrenPage,
  RentalSpaceSearchPage,
  RentalSpaceSubtreeDepth,
  RentalTenantDetail,
  RentalTenantDetailQuery,
  RentalTenantPage,
  RentalTenantSensitiveDetail,
  RevealRentalContractPartySensitiveRequest,
  RevealRentalTenantSensitiveRequest,
  RevokeRentalContractTerminationRequest,
  SetRentalPropertyStatusRequest,
  SetRentalTenantStatusRequest,
  ListRentalContractsQuery as SharedListRentalContractsQuery,
  ListRentalTenantsQuery as SharedListRentalTenantsQuery,
  TerminateRentalContractRequest,
  UpdateRentalContractRequest,
  UpdateRentalPropertyRequest,
  UpdateRentalSpaceRequest,
  UpdateRentalTenantRequest,
} from "@xpense/shared";

import type { ApiClient, ApiRequestOptions } from "./api-client";

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

export type ListRentalTenantsQuery = SharedListRentalTenantsQuery;
export type ListRentalContractsQuery = SharedListRentalContractsQuery;

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
    listTenants: (query: ListRentalTenantsQuery = {}) =>
      client.get<RentalTenantPage>(`/rental-tenants/list${toTenantsQueryString(query)}`),
    tenantDetail: (id: string) =>
      client.get<RentalTenantDetail>(`/rental-tenants/detail${toDetailQueryString({ id })}`),
    createTenant: (input: CreateRentalTenantRequest) =>
      client.post<RentalTenantDetail>("/rental-tenants/create", input),
    updateTenant: (input: UpdateRentalTenantRequest) =>
      client.post<RentalTenantDetail>("/rental-tenants/update", input),
    setTenantStatus: (input: SetRentalTenantStatusRequest) =>
      client.post<RentalTenantDetail>("/rental-tenants/set-status", input),
    deleteTenant: (id: string) =>
      client.post<void>("/rental-tenants/delete", { id } as DeleteRentalTenantRequest),
    revealTenantSensitive: (
      input: RevealRentalTenantSensitiveRequest,
      requestOptions?: Pick<ApiRequestOptions, "signal">,
    ) =>
      requestOptions
        ? client.post<RentalTenantSensitiveDetail>(
            "/rental-tenants/reveal-sensitive",
            input,
            requestOptions,
          )
        : client.post<RentalTenantSensitiveDetail>("/rental-tenants/reveal-sensitive", input),
    listContracts: (query: ListRentalContractsQuery = {}) =>
      client.get<RentalContractPage>(`/rental-contracts/list${toContractsQueryString(query)}`),
    contractDetail: (id: string) =>
      client.get<RentalContractDetail>(`/rental-contracts/detail${toDetailQueryString({ id })}`),
    createContract: (input: CreateRentalContractRequest) =>
      client.post<RentalContractDetail>("/rental-contracts/create", input),
    updateContract: (input: UpdateRentalContractRequest) =>
      client.post<RentalContractDetail>("/rental-contracts/update", input),
    checkContractAvailability: (input: CheckRentalContractAvailabilityRequest) =>
      client.post<RentalContractAvailability>("/rental-contracts/check-availability", input),
    confirmContract: (input: ConfirmRentalContractRequest) =>
      client.post<RentalContractDetail>("/rental-contracts/confirm", input),
    cancelContract: (input: CancelRentalContractRequest) =>
      client.post<RentalContractDetail>("/rental-contracts/cancel", input),
    changeContractParties: (input: ChangeRentalContractPartiesRequest) =>
      client.post<RentalContractDetail>("/rental-contracts/change-parties", input),
    terminateContract: (input: TerminateRentalContractRequest) =>
      client.post<RentalContractDetail>("/rental-contracts/terminate", input),
    revokeContractTermination: (input: RevokeRentalContractTerminationRequest) =>
      client.post<RentalContractDetail>("/rental-contracts/revoke-termination", input),
    renewContract: (input: RenewRentalContractRequest) =>
      client.post<RentalContractDetail>("/rental-contracts/renew", input),
    deleteContract: (input: DeleteRentalContractRequest) =>
      client.post<void>("/rental-contracts/delete", input),
    revealContractPartySensitive: (
      input: RevealRentalContractPartySensitiveRequest,
      requestOptions?: Pick<ApiRequestOptions, "signal">,
    ) =>
      requestOptions
        ? client.post<RentalContractPartySensitiveDetail>(
            "/rental-contracts/reveal-sensitive",
            input,
            requestOptions,
          )
        : client.post<RentalContractPartySensitiveDetail>(
            "/rental-contracts/reveal-sensitive",
            input,
          ),
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

/** 租赁 API 客户端类型；新增租户/合同端点保持对旧页面测试 seam 的兼容。 */
type RentalTenancyApi = Pick<
  ReturnType<typeof createRentalApi>,
  | "listTenants"
  | "tenantDetail"
  | "createTenant"
  | "updateTenant"
  | "setTenantStatus"
  | "deleteTenant"
  | "revealTenantSensitive"
  | "listContracts"
  | "contractDetail"
  | "createContract"
  | "updateContract"
  | "checkContractAvailability"
  | "confirmContract"
  | "cancelContract"
  | "changeContractParties"
  | "terminateContract"
  | "revokeContractTermination"
  | "renewContract"
  | "deleteContract"
  | "revealContractPartySensitive"
>;
export type RentalApi = Omit<ReturnType<typeof createRentalApi>, keyof RentalTenancyApi> &
  Partial<RentalTenancyApi>;

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

function toTenantsQueryString(query: ListRentalTenantsQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "keyword", query.keyword?.trim());
  appendParam(params, "type", query.type);
  appendParam(params, "isActive", query.isActive?.toString());
  appendParam(params, "documentCountryCode", query.documentCountryCode);
  appendParam(params, "documentType", query.documentType);
  appendParam(params, "documentNumber", query.documentNumber);
  appendParam(params, "page", query.page?.toString());
  appendParam(params, "pageSize", query.pageSize?.toString());
  return withQueryPrefix(params);
}

function toContractsQueryString(query: ListRentalContractsQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "keyword", query.keyword?.trim());
  appendParam(params, "propertyId", query.propertyId);
  appendParam(params, "tenantId", query.tenantId);
  appendParam(params, "status", query.status);
  appendParam(params, "startDateFrom", query.startDateFrom);
  appendParam(params, "startDateTo", query.startDateTo);
  appendParam(params, "endDateFrom", query.endDateFrom);
  appendParam(params, "endDateTo", query.endDateTo);
  appendParam(params, "page", query.page?.toString());
  appendParam(params, "pageSize", query.pageSize?.toString());
  return withQueryPrefix(params);
}

function toDetailQueryString(query: RentalTenantDetailQuery | RentalContractDetailQuery): string {
  const params = new URLSearchParams();
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
