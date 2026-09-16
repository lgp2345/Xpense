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

const CategoriesPage = lazyRouteComponent(
  () => import("@/features/bookkeeping/categories/categories-page"),
  "CategoriesPage",
);

export const Route = createFileRoute("/_authenticated/(bookkeeping)/categories")({
  staticData: { routeKey: "Categories" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "Categories"),
      CategoriesPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "Categories",
      cacheParams: params,
      render: ({ session }) => <CategoriesRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

function CategoriesRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <CategoriesPage
      api={session.bookkeepingApi}
      organizationId={organizationId}
      permissions={permissions}
    />
  );
}
