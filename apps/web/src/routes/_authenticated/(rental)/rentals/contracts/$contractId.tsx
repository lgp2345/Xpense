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
import type { RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";

const ContractDetailPage = lazyRouteComponent(
  () => import("@/features/rental/contracts/contract-detail-page"),
  "ContractDetailPage",
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/contracts/$contractId")({
  staticData: { routeKey: "RentalContractDetail" },
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "RentalContractDetail"),
      ContractDetailPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalContractDetail",
      cacheParams: { contractId: params.contractId },
      render: ({ session }) => (
        <ContractDetailRoutePage contractId={params.contractId} search={search} session={session} />
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

export type RentalContractDetailRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  contractId: string;
  navigate: RegisteredPageInput<typeof Route>["navigate"];
  search: Record<string, unknown>;
};

export function createRentalContractDetailRoutePageProps(
  input: Pick<RegisteredPageInput<typeof Route>, "navigate" | "search" | "params"> & {
    session: WebSessionDependency;
  },
  context: RentalRoutePageContext,
): RentalContractDetailRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    contractId: input.params.contractId,
    navigate: input.navigate,
    search: input.search,
  };
}

function ContractDetailRoutePage({
  contractId,
  search,
  session,
}: {
  contractId: string;
  search: Record<string, unknown>;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();
  const props = createRentalContractDetailRoutePageProps(
    { session, navigate, params: { contractId }, search },
    { organizationId, permissions },
  );

  return <ContractDetailPage {...props} />;
}
