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

const SessionsPage = lazyRouteComponent(
  () => import("@/features/sessions/sessions-page"),
  "SessionsPage",
);

export const Route = createFileRoute("/_authenticated/(iam)/sessions")({
  staticData: { routeKey: "Sessions" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "Sessions"),
      SessionsPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "Sessions",
      cacheParams: params,
      render: ({ session }) => <SessionsRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

function SessionsRoutePage({ session }: { session: WebSessionDependency }) {
  const navigate = Route.useNavigate();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const currentSessionId = useStore(session.authStore, (state) => state.session?.id);

  return (
    <SessionsPage
      api={session.authApi}
      currentSessionId={currentSessionId}
      onCurrentSessionRevoked={() => {
        session.authStore.getState().clearAuth();
        void navigate({ to: "/login", search: { redirect: "/" }, replace: true });
      }}
      permissions={permissions}
    />
  );
}
