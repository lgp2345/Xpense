import { createFileRoute, Outlet } from "@tanstack/react-router";

import { requireAuthenticatedRouteAccess } from "@/routes/-shared/access";

export const Route = createFileRoute("/_session")({
  beforeLoad: ({ context, location }) => requireAuthenticatedRouteAccess(context, location),
  component: Outlet,
});
