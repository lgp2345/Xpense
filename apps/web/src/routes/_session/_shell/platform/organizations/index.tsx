import { createFileRoute } from "@tanstack/react-router";
import { OrganizationListPage } from "@/features/organizations/organization-list-page";
import { requirePlatformRouteAccess } from "@/routes/-shared/access";
import { normalizeOrganizationQuery } from "@/services/organizations-query";
export const Route = createFileRoute("/_session/_shell/platform/organizations/")({
  validateSearch: normalizeOrganizationQuery,
  beforeLoad: ({ context, location }) => requirePlatformRouteAccess(context, location),
  component: OrganizationListRoute,
});
function OrganizationListRoute() {
  const { session } = Route.useRouteContext();
  const query = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <OrganizationListPage
      onCreate={() => void navigate({ to: "/platform/organizations/new" })}
      session={session}
      query={query}
      onQueryChange={(search) => void navigate({ search, replace: true })}
      onDetail={(organizationId) =>
        void navigate({ to: "/platform/organizations/$organizationId", params: { organizationId } })
      }
      onEntered={() => void navigate({ to: "/" })}
    />
  );
}
