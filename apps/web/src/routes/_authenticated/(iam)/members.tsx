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

const MembersPage = lazyRouteComponent(
  () => import("@/features/members/members-page"),
  "MembersPage",
);

export const Route = createFileRoute("/_authenticated/(iam)/members")({
  staticData: { routeKey: "Members" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "Members"),
      MembersPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "Members",
      cacheParams: params,
      render: ({ session }) => <MembersRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

function MembersRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);

  return <MembersPage api={session.iamApi} permissions={permissions} />;
}
