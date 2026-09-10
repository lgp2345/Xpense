import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const AccountsPage = lazy(() =>
  import("@/features/bookkeeping/accounts/accounts-page").then((module) => ({
    default: module.AccountsPage,
  })),
);

export const Route = createFileRoute("/_authenticated/(bookkeeping)/accounts")({
  staticData: { routeKey: "Accounts" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "Accounts")),
    registeredPage: defineRegisteredPage({
      routeKey: "Accounts",
      cacheParams: params,
      render: ({ session }) => <AccountsRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

function AccountsRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return renderLazyPage(
    <AccountsPage
      api={session.bookkeepingApi}
      organizationId={organizationId}
      permissions={permissions}
    />,
  );
}
