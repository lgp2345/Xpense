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
import type { RentalBillsApi } from "@/services/rental-bills-api";
import type { RentalFinanceApi } from "@/services/rental-finance-api";
import type { WebSessionDependency } from "@/services/web-session";

const BillDetailPage = lazyRouteComponent(
  () => import("@/features/rental/bills/bill-detail-page"),
  "BillDetailPage",
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/bills/$billId")({
  staticData: { routeKey: "RentalBillDetail" },
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "RentalBillDetail"),
      BillDetailPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalBillDetail",
      cacheParams: { billId: params.billId },
      render: ({ session }) => (
        <BillDetailRoutePage billId={params.billId} search={search} session={session} />
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

export type RentalBillDetailRoutePageProps = RentalRoutePageContext & {
  api: RentalBillsApi;
  financeApi: RentalFinanceApi;
  billId: string;
  navigate: RegisteredPageInput<typeof Route>["navigate"];
  search: Record<string, unknown>;
};

export function createRentalBillDetailRoutePageProps(
  input: Pick<RegisteredPageInput<typeof Route>, "navigate" | "search" | "params"> & {
    session: WebSessionDependency;
  },
  context: RentalRoutePageContext,
): RentalBillDetailRoutePageProps {
  return {
    ...context,
    api: input.session.rentalBillsApi,
    financeApi: input.session.rentalFinanceApi,
    billId: input.params.billId,
    navigate: input.navigate,
    search: input.search,
  };
}

function BillDetailRoutePage({
  billId,
  search,
  session,
}: {
  billId: string;
  search: Record<string, unknown>;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();
  const props = createRentalBillDetailRoutePageProps(
    { session, navigate, params: { billId }, search },
    { organizationId, permissions },
  );

  return <BillDetailPage {...props} />;
}
