import { createFileRoute } from "@tanstack/react-router";
import { ChangePasswordPage } from "@/features/auth/change-password-page";
export const Route = createFileRoute("/_session/_shell/account/password")({
  component: AccountPasswordRoute,
});
function AccountPasswordRoute() {
  const { session } = Route.useRouteContext();
  return <ChangePasswordPage session={session} />;
}
