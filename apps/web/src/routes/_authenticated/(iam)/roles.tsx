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

const RolesPage = lazyRouteComponent(() => import("@/features/roles/roles-page"), "RolesPage");

export const Route = createFileRoute("/_authenticated/(iam)/roles")({
  staticData: { routeKey: "Roles" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "Roles"),
      RolesPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "Roles",
      cacheParams: params,
      render: ({ session }) => <RolesRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

function RolesRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);

  return <RolesPage api={session.iamApi} permissions={permissions} />;
}
