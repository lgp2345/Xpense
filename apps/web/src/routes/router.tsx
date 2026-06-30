import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";

import { FoundationPage } from "../pages/foundation-page";

const rootRoute = createRootRoute({
  component: FoundationPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: FoundationPage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
