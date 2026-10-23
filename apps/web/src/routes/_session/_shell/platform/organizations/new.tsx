import { createFileRoute } from "@tanstack/react-router";
import { OrganizationCreatePage } from "@/features/organizations/organization-create-page";
import { useSecondaryPageBack } from "@/hooks/use-secondary-page-back";
import { requirePlatformRouteAccess } from "@/routes/-shared/access";
export const Route = createFileRoute("/_session/_shell/platform/organizations/new")({
  beforeLoad: ({ context, location }) => requirePlatformRouteAccess(context, location),
  component: OrganizationCreateRoute,
});
function OrganizationCreateRoute() {
  const { session } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  const onBack = useSecondaryPageBack(
    () => void navigate({ to: "/platform/organizations", search: { page: 1, pageSize: 20 } }),
  );
  return (
    <OrganizationCreatePage
      session={session}
      onBack={onBack}
      onCreated={(organizationId) =>
        void navigate({
          to: "/platform/organizations/$organizationId",
          params: { organizationId },
          replace: true,
        })
      }
    />
  );
}
