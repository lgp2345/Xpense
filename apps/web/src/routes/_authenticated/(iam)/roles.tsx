import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const RolesPage = lazy(() =>
  import("@/features/roles/roles-page").then((module) => ({ default: module.RolesPage })),
);

export const Route = createFileRoute("/_authenticated/(iam)/roles")({
  staticData: { routeKey: "Roles" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "Roles")),
    registeredPage: defineRegisteredPage({
      routeKey: "Roles",
      cacheParams: params,
      render: ({ session }) => <RolesRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

function RolesRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);

  return renderLazyPage(<RolesPage api={session.iamApi} permissions={permissions} />);
}
