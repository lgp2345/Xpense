import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { readSearchPage, readTrimmedSearchString } from "@/routes/-shared/search";
import { RouteAccessPending } from "@/routes/-shared/status";
import type { ListRentalPropertiesQuery } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";

const PropertiesPage = lazyRouteComponent(
  () => import("@/features/rental/properties/properties-page"),
  "PropertiesPage",
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/properties/")({
  staticData: { routeKey: "RentalProperties" },
  validateSearch: validateRentalPropertiesSearch,
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "RentalProperties"),
      PropertiesPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalProperties",
      cacheParams: params,
      render: ({ session }) => <PropertiesRoutePage search={search} session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

export function validateRentalPropertiesSearch(
  search: Record<string, unknown>,
): ListRentalPropertiesQuery {
  const result: ListRentalPropertiesQuery = {};
  const keyword = readTrimmedSearchString(search.keyword);
  const type = readRentalPropertyType(search.type);
  const isActive = readSearchBoolean(search.isActive);
  const province = readTrimmedSearchString(search.province);
  const city = readTrimmedSearchString(search.city);
  const district = readTrimmedSearchString(search.district);
  const page = readSearchPage(search.page);
  const pageSize = readSearchPageSize(search.pageSize);
  if (keyword) result.keyword = keyword;
  if (type) result.type = type;
  if (isActive !== undefined) result.isActive = isActive;
  if (province) result.province = province;
  if (city) result.city = city;
  if (district) result.district = district;
  if (page) result.page = page;
  if (pageSize) result.pageSize = pageSize;
  return result;
}

function PropertiesRoutePage({
  search,
  session,
}: {
  search: ListRentalPropertiesQuery;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();

  return (
    <PropertiesPage
      api={session.rentalApi}
      organizationId={organizationId}
      permissions={permissions}
      search={search}
      onSearchChange={(nextSearch) => void navigate({ search: nextSearch, replace: true } as never)}
      onNavigate={(propertyId) =>
        void navigate({ to: "/rentals/properties/$propertyId", params: { propertyId } })
      }
      onCreateContract={(propertyId) =>
        void navigate({ to: "/rentals/contracts/new", search: { propertyId } })
      }
    />
  );
}

function readRentalPropertyType(value: unknown): ListRentalPropertiesQuery["type"] {
  const types = [
    "residential_unit",
    "detached_house",
    "apartment_building",
    "commercial_building",
    "complex",
    "shop",
    "office",
    "warehouse",
    "other",
  ] as const;
  return typeof value === "string" && types.some((type) => type === value)
    ? (value as ListRentalPropertiesQuery["type"])
    : undefined;
}

function readSearchBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function readSearchPageSize(value: unknown): number | undefined {
  const pageSize = readSearchPage(value);
  return pageSize !== undefined && pageSize <= 100 ? pageSize : undefined;
}
