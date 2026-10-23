import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { RouteAccessPending } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const OrganizationSettingsPage = lazyRouteComponent(
  () => import("@/features/organizations/organization-settings-page"),
  "OrganizationSettingsPage",
);

export const Route = createFileRoute("/_authenticated/(iam)/organization-settings")({
  staticData: { routeKey: "OrganizationSettings" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "OrganizationSettings"),
      OrganizationSettingsPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "OrganizationSettings",
      cacheParams: params,
      render: ({ session }) => <OrganizationSettingsRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

function OrganizationSettingsRoutePage({ session }: { session: WebSessionDependency }) {
  return <OrganizationSettingsPage session={session} />;
}
