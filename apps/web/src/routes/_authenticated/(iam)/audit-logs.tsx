import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { useStore } from "zustand";
import type { AuditLogSearch } from "@/features/audit/audit-log-filters";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { readSearchDate, readSearchPage, readSearchString } from "@/routes/-shared/search";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const AuditLogsPage = lazy(() =>
  import("@/features/audit/audit-logs-page").then((module) => ({ default: module.AuditLogsPage })),
);

export const Route = createFileRoute("/_authenticated/(iam)/audit-logs")({
  staticData: { routeKey: "AuditLogs" },
  validateSearch: validateAuditLogSearch,
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "AuditLogs")),
    registeredPage: defineRegisteredPage({
      routeKey: "AuditLogs",
      cacheParams: params,
      render: ({ session }) => <AuditLogsRoutePage search={search} session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

export function validateAuditLogSearch(search: Record<string, unknown>): AuditLogSearch {
  return {
    action: readSearchString(search.action),
    actorUserId: readSearchString(search.actorUserId),
    from: readSearchDate(search.from),
    page: readSearchPage(search.page),
    targetType: readSearchString(search.targetType),
    to: readSearchDate(search.to),
  };
}

function AuditLogsRoutePage({
  search,
  session,
}: {
  search: AuditLogSearch;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const navigate = Route.useNavigate();

  return renderLazyPage(
    <AuditLogsPage
      api={session.iamApi}
      permissions={permissions}
      search={search}
      onSearchChange={(nextSearch) => void navigate({ search: nextSearch, replace: true })}
    />,
  );
}
