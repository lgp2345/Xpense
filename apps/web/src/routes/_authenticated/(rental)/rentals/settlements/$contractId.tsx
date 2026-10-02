import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { useStore } from "zustand";

import type { RegisteredPageInput } from "@/components/layout/page-cache-host";
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
  const props = createRentalSettlementRoutePageProps(
    { session, params: { contractId } },
    { organizationId, permissions },
  );
  return <SettlementPage {...props} />;
}
