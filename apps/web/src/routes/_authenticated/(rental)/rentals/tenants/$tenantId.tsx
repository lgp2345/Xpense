import { createFileRoute } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { lazy } from "react";
import { useStore } from "zustand";
import type { RegisteredPageInput } from "@/components/layout/page-cache-host";
import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";

const TenantDetailPage = lazy(() =>
  import("@/features/rental/tenants/tenant-detail-page").then((module) => ({
    default: module.TenantDetailPage,
  })),
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/tenants/$tenantId")({
  staticData: { routeKey: "RentalTenantDetail" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "RentalTenantDetail")),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalTenantDetail",
      cacheParams: { tenantId: params.tenantId },
      render: ({ session }) => (
        <TenantDetailRoutePage tenantId={params.tenantId} session={session} />
      ),
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

type RentalRoutePageContext = {
  organizationId: string;
  permissions: readonly PermissionKey[];
};

export type RentalTenantDetailRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  navigate: RegisteredPageInput<typeof Route>["navigate"];
  search: Record<string, unknown>;
  tenantId: string;
};

export function createRentalTenantDetailRoutePageProps(
  input: Pick<RegisteredPageInput<typeof Route>, "navigate" | "search" | "params"> & {
    session: WebSessionDependency;
  },
  context: RentalRoutePageContext,
): RentalTenantDetailRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    navigate: input.navigate,
    search: input.search,
    tenantId: input.params.tenantId,
  };
}

function TenantDetailRoutePage({
  tenantId,
  session,
}: {
  tenantId: string;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();
  const props = createRentalTenantDetailRoutePageProps(
    { session, navigate, params: { tenantId }, search: {} } as Pick<
      RegisteredPageInput<typeof Route>,
      "navigate" | "search" | "params"
    > & { session: WebSessionDependency },
    { organizationId, permissions },
  );

  return renderLazyPage(<TenantDetailPage {...props} />);
}
