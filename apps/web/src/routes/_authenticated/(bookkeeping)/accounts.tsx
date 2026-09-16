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

const AccountsPage = lazyRouteComponent(
  () => import("@/features/bookkeeping/accounts/accounts-page"),
  "AccountsPage",
);

export const Route = createFileRoute("/_authenticated/(bookkeeping)/accounts")({
  staticData: { routeKey: "Accounts" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "Accounts"),
      AccountsPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "Accounts",
      cacheParams: params,
      render: ({ session }) => <AccountsRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

function AccountsRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );

  return (
    <AccountsPage
      api={session.bookkeepingApi}
      organizationId={organizationId}
      permissions={permissions}
    />
  );
}
