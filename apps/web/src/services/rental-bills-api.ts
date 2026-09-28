import type {
  GenerateRentalBillsRequest,
  ListRentalBillsQuery,
  PreviewRentalBillsRequest,
  PreviewRentalTerminationRequest,
  RentalBillDetail,
  RentalBillGenerationResult,
  RentalBillPage,
  RentalBillPreview,
  RentalTerminationPreview,
} from "@xpense/shared";
import type { ApiClient } from "./api-client";

/** 账单 HTTP 边界，正常租金与金额依据始终由服务端计算。 */
export function createRentalBillsApi(client: ApiClient) {
  return {
    listBills: (query: ListRentalBillsQuery = {}) =>
      client.get<RentalBillPage>(`/rental-bills/list${listQueryString(query)}`),
    getBill: (id: string) =>
      client.get<RentalBillDetail>(`/rental-bills/detail?id=${encodeURIComponent(id)}`),
    previewBills: (input: PreviewRentalBillsRequest) =>
      client.post<RentalBillPreview>("/rental-bills/preview", {
        ...generationInput(input),
        ...(input.expectedVersion ? { expectedVersion: input.expectedVersion } : {}),
        ...(input.page ? { page: input.page } : {}),
        ...(input.pageSize ? { pageSize: input.pageSize } : {}),
      }),
    generateBills: (input: GenerateRentalBillsRequest) =>
      client.post<RentalBillGenerationResult>("/rental-bills/generate", {
        ...generationInput(input),
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
      }),
    previewTermination: (input: PreviewRentalTerminationRequest) =>
      client.post<RentalTerminationPreview>("/rental-bills/termination-preview", input),
  };
}
export type RentalBillsApi = ReturnType<typeof createRentalBillsApi>;
function generationInput(input: PreviewRentalBillsRequest) {
  return {
    contractId: input.contractId,
    depositDueDates: input.depositDueDates,
    ...(input.terminationConfirmation
      ? { terminationConfirmation: input.terminationConfirmation }
      : {}),
  };
}
function listQueryString(query: ListRentalBillsQuery): string {
  const params = new URLSearchParams();
  for (const key of [
    "contractId",
    "propertyId",
    "keyword",
    "type",
    "status",
    "dueDateFrom",
    "dueDateTo",
    "page",
    "pageSize",
  ] as const) {
    const value = query[key];
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}
/** 一次确认的不可变请求；未知网络结果重试保留同一幂等键。 */
export function createRentalBillGenerationAttempt(
  api: RentalBillsApi,
  input: Omit<GenerateRentalBillsRequest, "idempotencyKey">,
) {
  const request: GenerateRentalBillsRequest = {
    ...structuredClone(input),
    idempotencyKey: crypto.randomUUID(),
  };
  return {
    request: structuredClone(request),
    submit: () => api.generateBills(structuredClone(request)),
  };
}
