import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { DashboardPage } from "../pages/dashboard-page";
import { FoundationPage } from "../pages/foundation-page";

const rootRoute = createRootRoute({
  component: Outlet,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const foundationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/foundation",
  component: FoundationPage,
});

const routeTree = rootRoute.addChildren([indexRoute, foundationRoute]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
