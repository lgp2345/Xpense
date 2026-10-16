import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { useStore } from "zustand";
import type { PropertyDetailSearch } from "@/features/rental/spaces/property-detail-search";
import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { readSearchDate, readSearchPage, readTrimmedSearchString } from "@/routes/-shared/search";
import { RouteAccessPending } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const PropertyDetailPage = lazyRouteComponent(
  () => import("@/features/rental/spaces/property-detail-page"),
  "PropertyDetailPage",
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/properties/$propertyId")({
  staticData: { routeKey: "RentalPropertyDetail" },
  validateSearch: validatePropertyDetailSearch,
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "RentalPropertyDetail"),
      PropertyDetailPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalPropertyDetail",
      cacheParams: { propertyId: params.propertyId },
      render: ({ session }) => (
        <PropertyDetailRoutePage
          propertyId={params.propertyId}
          session={session}
          search={validatePropertyDetailSearch(search)}
        />
      ),
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

function PropertyDetailRoutePage({
  propertyId,
  session,
  search,
}: {
  search: PropertyDetailSearch;
  propertyId: string;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();

  return (
    <PropertyDetailPage
      api={session.rentalApi}
      organizationId={organizationId}
      permissions={permissions}
      propertyId={propertyId}
      search={search}
      onSearchChange={(next) => void navigate({ search: next, replace: true })}
      onCreateContract={(id) =>
        void navigate({ to: "/rentals/contracts/new", search: { propertyId: id } })
      }
      onNavigateContract={(contractId) =>
        void navigate({ to: "/rentals/contracts/$contractId", params: { contractId } })
      }
    />
  );
}

/** 房产详情两组筛选相互独立，并从 URL 恢复。非法枚举、日期区间和页码不应用。 */
export function validatePropertyDetailSearch(input: Record<string, unknown>): PropertyDetailSearch {
  const result: PropertyDetailSearch = {};
  const keyword = readTrimmedSearchString(
    typeof input.keyword === "number" || typeof input.keyword === "boolean"
      ? String(input.keyword)
      : input.keyword,
  );
  const spaceKeyword = readTrimmedSearchString(
    typeof input.spaceKeyword === "number" || typeof input.spaceKeyword === "boolean"
      ? String(input.spaceKeyword)
      : input.spaceKeyword,
  );
  if (keyword) result.keyword = keyword;
  if (spaceKeyword) result.spaceKeyword = spaceKeyword;
  const statuses = [
    "draft",
    "upcoming",
    "active",
    "expiring_soon",
    "expired",
    "cancelled",
    "terminated",
  ];
  if (typeof input.status === "string" && statuses.includes(input.status))
    result.status = input.status as PropertyDetailSearch["status"];
  if (input.spaceEffectiveStatus === "active" || input.spaceEffectiveStatus === "inactive")
    result.spaceEffectiveStatus = input.spaceEffectiveStatus;
  if (
    typeof input.spaceLeaseStatus === "string" &&
    ["vacant", "upcoming", "active", "expiring_soon"].includes(input.spaceLeaseStatus)
  )
    result.spaceLeaseStatus = input.spaceLeaseStatus as PropertyDetailSearch["spaceLeaseStatus"];
  const startDateFrom = readSearchDate(input.startDateFrom),
    startDateTo = readSearchDate(input.startDateTo);
  const endDateFrom = readSearchDate(input.endDateFrom),
    endDateTo = readSearchDate(input.endDateTo);
  if (!startDateFrom || !startDateTo || startDateFrom <= startDateTo) {
    if (startDateFrom) result.startDateFrom = startDateFrom;
    if (startDateTo) result.startDateTo = startDateTo;
  }
  if (!endDateFrom || !endDateTo || endDateFrom <= endDateTo) {
    if (endDateFrom) result.endDateFrom = endDateFrom;
    if (endDateTo) result.endDateTo = endDateTo;
  }
  const page = readSearchPage(input.page),
    pageSize = readSearchPage(input.pageSize);
  if (page) result.page = page;
  if (pageSize && pageSize <= 100) result.pageSize = pageSize;
  return result;
}
