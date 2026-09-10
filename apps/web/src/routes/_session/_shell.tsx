import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";

export const Route = createFileRoute("/_session/_shell")({
  component: SessionShellLayout,
});

function SessionShellLayout() {
  const { session } = Route.useRouteContext();

  return <AuthenticatedLayout requiresMenuBootstrap={false} session={session} />;
}
