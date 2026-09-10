import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const SessionsPage = lazy(() =>
  import("@/features/sessions/sessions-page").then((module) => ({ default: module.SessionsPage })),
);

export const Route = createFileRoute("/_authenticated/(iam)/sessions")({
  staticData: { routeKey: "Sessions" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "Sessions")),
    registeredPage: defineRegisteredPage({
      routeKey: "Sessions",
      cacheParams: params,
      render: ({ session }) => <SessionsRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

function SessionsRoutePage({ session }: { session: WebSessionDependency }) {
  const navigate = Route.useNavigate();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const currentSessionId = useStore(session.authStore, (state) => state.session?.id);

  return renderLazyPage(
    <SessionsPage
      api={session.authApi}
      currentSessionId={currentSessionId}
      onCurrentSessionRevoked={() => {
        session.authStore.getState().clearAuth();
        void navigate({ to: "/login", search: { redirect: "/" }, replace: true });
      }}
      permissions={permissions}
    />,
  );
}
