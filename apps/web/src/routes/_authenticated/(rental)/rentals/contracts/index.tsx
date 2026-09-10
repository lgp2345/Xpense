import { createFileRoute } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { lazy } from "react";
import { useStore } from "zustand";

import type { RegisteredPageInput } from "@/components/layout/page-cache-host";
import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { readSearchDate, readSearchPage, readTrimmedSearchString } from "@/routes/-shared/search";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { ListRentalContractsQuery, RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";

const ContractsPage = lazy(() =>
  import("@/features/rental/contracts/contracts-page").then((module) => ({
    default: module.ContractsPage,
  })),
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/contracts/")({
  staticData: { routeKey: "RentalContracts" },
  validateSearch: validateRentalContractsSearch,
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "RentalContracts")),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalContracts",
      cacheParams: params,
      render: ({ session }) => <ContractsRoutePage search={search} session={session} />,
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

export type RentalContractsRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  search: ListRentalContractsQuery;
};

export function createRentalContractsRoutePageProps(
  input: Pick<RegisteredPageInput<typeof Route>, "search"> & {
    session: WebSessionDependency;
  },
  context: RentalRoutePageContext,
): RentalContractsRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    search: input.search,
  };
}

export function validateRentalContractsSearch(
  search: Record<string, unknown>,
): ListRentalContractsQuery {
  const result: ListRentalContractsQuery = {};
  const keyword = readTrimmedSearchString(search.keyword);
  const propertyId = readSearchUuid(search.propertyId);
  const tenantId = readSearchUuid(search.tenantId);
  const status = readRentalContractStatus(search.status);
  const startDateFrom = readSearchDate(search.startDateFrom);
  const startDateTo = readSearchDate(search.startDateTo);
  const endDateFrom = readSearchDate(search.endDateFrom);
  const endDateTo = readSearchDate(search.endDateTo);
  const page = readSearchPage(search.page);
  const pageSize = readSearchPage(search.pageSize);
  if (keyword) result.keyword = keyword;
  if (propertyId) result.propertyId = propertyId;
  if (tenantId) result.tenantId = tenantId;
  if (status) result.status = status;
  if (startDateFrom && (!startDateTo || startDateFrom <= startDateTo)) {
    result.startDateFrom = startDateFrom;
  }
  if (startDateTo && (!startDateFrom || startDateFrom <= startDateTo)) {
    result.startDateTo = startDateTo;
  }
  if (endDateFrom && (!endDateTo || endDateFrom <= endDateTo)) {
    result.endDateFrom = endDateFrom;
  }
  if (endDateTo && (!endDateFrom || endDateFrom <= endDateTo)) {
    result.endDateTo = endDateTo;
  }
  if (page) result.page = page;
  if (pageSize && pageSize <= 100) result.pageSize = pageSize;
  return result;
}

function ContractsRoutePage({
  search,
  session,
}: {
  search: ListRentalContractsQuery;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();
  const props = createRentalContractsRoutePageProps(
    { session, search },
    { organizationId, permissions },
  );

  return renderLazyPage(
    <ContractsPage
      {...props}
      onSearchChange={(nextSearch) => void navigate({ search: nextSearch, replace: true } as never)}
      onNavigate={(contractId) =>
        void navigate({ to: "/rentals/contracts/$contractId", params: { contractId } })
      }
    />,
  );
}

function readRentalContractStatus(value: unknown): ListRentalContractsQuery["status"] {
  const statuses = [
    "draft",
    "upcoming",
    "active",
    "expiring_soon",
    "expired",
    "cancelled",
    "terminated",
  ] as const;
  return typeof value === "string" && statuses.some((status) => status === value)
    ? (value as ListRentalContractsQuery["status"])
    : undefined;
}

const uuidPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

function readSearchUuid(value: unknown): string | undefined {
  const normalized = readTrimmedSearchString(value);
  return normalized && uuidPattern.test(normalized) ? normalized : undefined;
}
