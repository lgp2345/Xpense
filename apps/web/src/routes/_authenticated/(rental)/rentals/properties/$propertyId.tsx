import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const PropertyDetailPage = lazy(() =>
  import("@/features/rental/spaces/property-detail-page").then((module) => ({
    default: module.PropertyDetailPage,
  })),
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/properties/$propertyId")({
  staticData: { routeKey: "RentalPropertyDetail" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "RentalPropertyDetail")),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalPropertyDetail",
      cacheParams: { propertyId: params.propertyId },
      render: ({ session }) => (
        <PropertyDetailRoutePage propertyId={params.propertyId} session={session} />
      ),
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

function PropertyDetailRoutePage({
  propertyId,
  session,
}: {
  propertyId: string;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();

  return renderLazyPage(
    <PropertyDetailPage
      api={session.rentalApi}
      organizationId={organizationId}
      permissions={permissions}
      propertyId={propertyId}
      onCreateContract={(id) =>
        void navigate({ to: "/rentals/contracts/new", search: { propertyId: id } })
      }
      onNavigateContract={(contractId) =>
        void navigate({ to: "/rentals/contracts/$contractId", params: { contractId } })
      }
    />,
  );
}
