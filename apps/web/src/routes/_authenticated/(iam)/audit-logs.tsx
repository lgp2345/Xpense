import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { useStore } from "zustand";
import type { AuditLogSearch } from "@/features/audit/audit-log-filters";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { readSearchDate, readSearchPage, readSearchString } from "@/routes/-shared/search";
import { RouteAccessPending } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const AuditLogsPage = lazyRouteComponent(
  () => import("@/features/audit/audit-logs-page"),
  "AuditLogsPage",
);

export const Route = createFileRoute("/_authenticated/(iam)/audit-logs")({
  staticData: { routeKey: "AuditLogs" },
  validateSearch: validateAuditLogSearch,
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "AuditLogs"),
      AuditLogsPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "AuditLogs",
      cacheParams: params,
      render: ({ session }) => <AuditLogsRoutePage search={search} session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
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

  return (
    <AuditLogsPage
      api={session.iamApi}
      permissions={permissions}
      search={search}
      onSearchChange={(nextSearch) => void navigate({ search: nextSearch, replace: true })}
    />
  );
}
