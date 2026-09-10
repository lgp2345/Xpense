import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const MembersPage = lazy(() =>
  import("@/features/members/members-page").then((module) => ({ default: module.MembersPage })),
);

export const Route = createFileRoute("/_authenticated/(iam)/members")({
  staticData: { routeKey: "Members" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "Members")),
    registeredPage: defineRegisteredPage({
      routeKey: "Members",
      cacheParams: params,
      render: ({ session }) => <MembersRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

function MembersRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);

  return renderLazyPage(<MembersPage api={session.iamApi} permissions={permissions} />);
}
