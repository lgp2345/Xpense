import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { OrganizationListQuery } from "@xpense/shared";
import { z } from "zod";
import type { OrganizationsApi } from "./organizations-api";

const organizationSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  name: z.string().trim().optional().catch(undefined),
  status: z.enum(["active", "disabled"]).optional().catch(undefined),
});
export function normalizeOrganizationQuery(input: Record<string, unknown>): OrganizationListQuery {
  const parsed = organizationSearchSchema.parse(input);
  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    ...(parsed.name ? { name: parsed.name } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
  };
}
export const organizationsKeys = {
  root: ["platform-organizations"] as const,
  list: (userId: string, query: OrganizationListQuery) =>
    ["platform-organizations", userId, "list", query] as const,
  detail: (userId: string, id: string) => ["platform-organizations", userId, "detail", id] as const,
};
export const organizationsQueryOptions = {
  settings: (api: OrganizationsApi, userId: string, orgId: string) =>
    queryOptions({
      queryKey: ["organization-settings", userId, orgId],
      queryFn: () => api.settings(),
    }),
  list: (api: OrganizationsApi, userId: string, query: OrganizationListQuery) =>
    queryOptions({
      queryKey: organizationsKeys.list(userId, query),
      queryFn: () => api.list(query),
    }),
  detail: (api: OrganizationsApi, userId: string, id: string) =>
    queryOptions({ queryKey: organizationsKeys.detail(userId, id), queryFn: () => api.detail(id) }),
};
export function clearOrganizationsQueries(client: QueryClient): void {
  void client.cancelQueries({ queryKey: organizationsKeys.root });
  client.removeQueries({ queryKey: organizationsKeys.root });
}

export function clearOrganizationSettingsQueries(client: QueryClient): void {
  void client.cancelQueries({ queryKey: ["organization-settings"] });
  client.removeQueries({ queryKey: ["organization-settings"] });
}
