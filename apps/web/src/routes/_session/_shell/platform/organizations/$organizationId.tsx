import { createFileRoute } from "@tanstack/react-router";
import { OrganizationDetailPage } from "@/features/organizations/organization-detail-page";
import { useSecondaryPageBack } from "@/hooks/use-secondary-page-back";
import { requirePlatformRouteAccess } from "@/routes/-shared/access";
export const Route = createFileRoute("/_session/_shell/platform/organizations/$organizationId")({
  beforeLoad: ({ context, location }) => requirePlatformRouteAccess(context, location),
  component: OrganizationDetailRoute,
});
function OrganizationDetailRoute() {
  const { session } = Route.useRouteContext();
  const { organizationId } = Route.useParams();
  const navigate = Route.useNavigate();
  const onBack = useSecondaryPageBack(
    () => void navigate({ to: "/platform/organizations", search: { page: 1, pageSize: 20 } }),
  );
  return (
    <OrganizationDetailPage
      session={session}
      organizationId={organizationId}
      onBack={onBack}
      onEntered={() => void navigate({ to: "/" })}
    />
  );
}
