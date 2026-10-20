import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { BreadcrumbLink } from "@/components/ui/breadcrumb";
import { MenuResetPage } from "@/features/menus/menu-reset-page";
import { useSecondaryPageBack } from "@/hooks/use-secondary-page-back";

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

  const navigate = Route.useNavigate();
  const onBack = useSecondaryPageBack(() => void navigate({ to: "/", replace: true }));
  return (
    <MenuResetPage
      session={session}
      onBack={onBack}
      breadcrumbs={[
        { key: "home", label: <BreadcrumbLink render={<Link to="/" />}>首页</BreadcrumbLink> },
        { key: "reset", label: "菜单恢复" },
      ]}
    />
  );
}
