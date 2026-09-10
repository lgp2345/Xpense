import { createFileRoute, redirect } from "@tanstack/react-router";

import { MenuResetPage } from "@/features/menus/menu-reset-page";

export const Route = createFileRoute("/_session/_shell/system/menu-reset")({
  beforeLoad: ({ context }) => {
    if (!context.session.authStore.getState().currentUser?.isSuperAdmin) {
      throw redirect({ to: "/forbidden" });
    }
  },
  component: MenuResetRoutePage,
});

function MenuResetRoutePage() {
  const { session } = Route.useRouteContext();

  return <MenuResetPage session={session} />;
}
