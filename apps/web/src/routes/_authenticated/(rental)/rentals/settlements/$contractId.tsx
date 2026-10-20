import { createFileRoute, Link, lazyRouteComponent } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { useStore } from "zustand";

import type { RegisteredPageInput } from "@/components/layout/page-cache-host";
import { BreadcrumbLink } from "@/components/ui/breadcrumb";
import { useSecondaryPageBack } from "@/hooks/use-secondary-page-back";
import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { RouteAccessPending } from "@/routes/-shared/status";
import type { RentalFinanceApi } from "@/services/rental-finance-api";
import type { WebSessionDependency } from "@/services/web-session";

const SettlementPage = lazyRouteComponent(
  () => import("@/features/rental/settlements/settlement-page"),
  "SettlementPage",
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/settlements/$contractId")({
  staticData: { routeKey: "RentalSettlement" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "RentalSettlement"),
      SettlementPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalSettlement",
      cacheParams: { contractId: params.contractId },
      render: ({ session }) => (
        <SettlementRoutePage contractId={params.contractId} session={session} />
      ),
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

type RentalRoutePageContext = {
  organizationId: string;
  permissions: readonly PermissionKey[];
};

export type RentalSettlementRoutePageProps = RentalRoutePageContext & {
  api: RentalFinanceApi;
  contractId: string;
};

export function createRentalSettlementRoutePageProps(
  input: Pick<RegisteredPageInput<typeof Route>, "params"> & { session: WebSessionDependency },
  context: RentalRoutePageContext,
): RentalSettlementRoutePageProps {
  return {
    ...context,
    api: input.session.rentalFinanceApi,
    contractId: input.params.contractId,
  };
}

function SettlementRoutePage({
  contractId,
  session,
}: {
  contractId: string;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();
  const onBack = useSecondaryPageBack(
    () =>
      void navigate({
        to: "/rentals/contracts/$contractId",
        params: { contractId },
        replace: true,
      }),
  );
  const props = createRentalSettlementRoutePageProps(
    { session, params: { contractId } },
    { organizationId, permissions },
  );
  return (
    <SettlementPage
      onBack={onBack}
      breadcrumbs={[
        {
          key: "contracts",
          label: (
            <BreadcrumbLink render={<Link to="/rentals/contracts" search={{}} />}>
              合同管理
            </BreadcrumbLink>
          ),
        },
        {
          key: "contract",
          label: (
            <BreadcrumbLink
              render={<Link to="/rentals/contracts/$contractId" params={{ contractId }} />}
            >
              合同详情
            </BreadcrumbLink>
          ),
        },
        { key: "current", label: "退租结算" },
      ]}
      {...props}
    />
  );
}
