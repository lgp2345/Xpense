import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { RouteAccessPending } from "@/routes/-shared/status";

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
      render: () => <DashboardPageLazy />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

const DashboardPageLazy = lazyRouteComponent(
  () => import("@/pages/dashboard-page"),
  "DashboardPage",
);
