import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

export const Route = createFileRoute("/_authenticated/(core)/")({
  staticData: { routeKey: "Dashboard" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "Dashboard")),
    registeredPage: defineRegisteredPage({
      routeKey: "Dashboard",
      cacheParams: params,
      render: ({ session }) => <DashboardRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

const DashboardPageLazy = lazy(() =>
  import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })),
);

function DashboardRoutePage({ session }: { session: WebSessionDependency }) {
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return renderLazyPage(
    <DashboardPageLazy api={session.bookkeepingApi} organizationId={organizationId} />,
  );
}
