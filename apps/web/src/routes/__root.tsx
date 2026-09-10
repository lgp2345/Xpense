import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthorizedMenuNode, RouteKey } from "@xpense/shared";

import type { WebSessionDependency } from "@/services/web-session";

import type { RegisteredPageDescriptor } from "./-shared/registered-page";
import { RouteAccessPending } from "./-shared/status";

export type AppRouterContext = {
  registeredMenu?: AuthorizedMenuNode;
  registeredMenuAuthorization?: object;
  registeredPage?: RegisteredPageDescriptor;
  session: WebSessionDependency;
};

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: Outlet,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    routeKey?: RouteKey;
  }
}
