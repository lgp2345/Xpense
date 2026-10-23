import type {
  CreateOrganizationInput,
  OrganizationDetail,
  OrganizationListQuery,
  OrganizationListResponse,
  OrganizationOwnerCandidate,
} from "@xpense/shared";
import type { ApiClient } from "./api-client";
export function createOrganizationsApi(client: ApiClient) {
  return {
    create: (input: CreateOrganizationInput) =>
      client.post<OrganizationDetail>("/organizations/create", input),
    resolveOwner: (phone: string) =>
      client.get<OrganizationOwnerCandidate | null>(
        `/organizations/owner-candidates/list?phone=${encodeURIComponent(phone)}`,
      ),
    list: (query: OrganizationListQuery) =>
      client.get<OrganizationListResponse>(
        `/organizations/list?${new URLSearchParams(
          Object.entries(query)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        )}`,
      ),
    detail: (id: string) =>
      client.get<OrganizationDetail>(`/organizations/detail?id=${encodeURIComponent(id)}`),
  };
}
export type OrganizationsApi = ReturnType<typeof createOrganizationsApi>;
