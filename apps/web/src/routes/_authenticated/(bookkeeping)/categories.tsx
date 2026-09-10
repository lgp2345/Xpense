import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const CategoriesPage = lazy(() =>
  import("@/features/bookkeeping/categories/categories-page").then((module) => ({
    default: module.CategoriesPage,
  })),
);

export const Route = createFileRoute("/_authenticated/(bookkeeping)/categories")({
  staticData: { routeKey: "Categories" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "Categories")),
    registeredPage: defineRegisteredPage({
      routeKey: "Categories",
      cacheParams: params,
      render: ({ session }) => <CategoriesRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

function CategoriesRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return renderLazyPage(
    <CategoriesPage
      api={session.bookkeepingApi}
      organizationId={organizationId}
      permissions={permissions}
    />,
  );
}
