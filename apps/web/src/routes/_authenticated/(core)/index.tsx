import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { RouteAccessPending } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

export const Route = createFileRoute("/_authenticated/(core)/")({
  staticData: { routeKey: "Dashboard" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "Dashboard"),
      DashboardPageLazy,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "Dashboard",
      cacheParams: params,
      render: ({ session }) => <DashboardRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

const DashboardPageLazy = lazyRouteComponent(
  () => import("@/pages/dashboard-page"),
  "DashboardPage",
);

function DashboardRoutePage({ session }: { session: WebSessionDependency }) {
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return <DashboardPageLazy api={session.bookkeepingApi} organizationId={organizationId} />;
}
