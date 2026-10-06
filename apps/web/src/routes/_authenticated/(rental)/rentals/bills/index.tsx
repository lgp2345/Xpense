import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { ListRentalBillsQuery } from "@xpense/shared";
import { useStore } from "zustand";
import { validateRentalBillsSearch } from "@/features/rental/bills/bill-search";
import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { RouteAccessPending } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const BillsPage = lazyRouteComponent(
  () => import("@/features/rental/bills/bills-page"),
  "BillsPage",
);
export const Route = createFileRoute("/_authenticated/(rental)/rentals/bills/")({
  staticData: { routeKey: "RentalBills" },
  validateSearch: validateRentalBillsSearch,
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "RentalBills"),
      BillsPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalBills",
      cacheParams: params,
      render: ({ session }) => <BillsRoutePage search={search} session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});
function BillsRoutePage({
  search,
  session,
}: {
  search: ListRentalBillsQuery;
  session: WebSessionDependency;
}) {
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const navigate = Route.useNavigate();
  return (
    <BillsPage
      api={session.rentalBillsApi}
      financeApi={session.rentalFinanceApi}
      organizationId={organizationId}
      permissions={permissions}
      search={search}
      onSearchChange={(next) => void navigate({ search: next, replace: true })}
      onNavigate={(billId) => void navigate({ to: "/rentals/bills/$billId", params: { billId } })}
    />
  );
}
