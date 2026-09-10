import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { requireAuthenticatedRouteAccess } from "@/routes/-shared/access";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => requireAuthenticatedRouteAccess(context, location),
  component: AuthenticatedRouteLayout,
});

function AuthenticatedRouteLayout() {
  const { session } = Route.useRouteContext();

  return <AuthenticatedLayout session={session} />;
}
