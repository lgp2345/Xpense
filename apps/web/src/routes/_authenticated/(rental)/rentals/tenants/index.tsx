import { createFileRoute } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { lazy } from "react";
import { useStore } from "zustand";
import type { RegisteredPageInput } from "@/components/layout/page-cache-host";
import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { readSearchPage, readSearchString, readTrimmedSearchString } from "@/routes/-shared/search";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { ListRentalTenantsQuery, RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";

const TenantsPage = lazy(() =>
  import("@/features/rental/tenants/tenants-page").then((module) => ({
    default: module.TenantsPage,
  })),
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/tenants/")({
  staticData: { routeKey: "RentalTenants" },
  validateSearch: validateRentalTenantsSearch,
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "RentalTenants")),
    registeredPage: defineRegisteredPage({
      routeKey: "RentalTenants",
      cacheParams: params,
      render: ({ session }) => <TenantsRoutePage search={search} session={session} />,
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

export type RentalTenantsRoutePageProps = RentalRoutePageContext & {
  api: RentalApi;
  navigate: RegisteredPageInput<typeof Route>["navigate"];
  search: ListRentalTenantsQuery;
};

export function createRentalTenantsRoutePageProps(
  input: Pick<RegisteredPageInput<typeof Route>, "navigate" | "search"> & {
    session: WebSessionDependency;
  },
  context: RentalRoutePageContext,
): RentalTenantsRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    navigate: input.navigate,
    search: input.search,
  };
}

export function validateRentalTenantsSearch(
  search: Record<string, unknown>,
): ListRentalTenantsQuery {
  const result: ListRentalTenantsQuery = {};
  const keyword = readTrimmedSearchString(search.keyword);
  const type = readRentalTenantType(search.type);
  const isActive = readSearchBoolean(search.isActive);
  const documentCountryCode = readSearchString(search.documentCountryCode);
  const documentType = readRentalDocumentType(search.documentType);
  const documentNumber =
    typeof search.documentNumber === "string" ? search.documentNumber : undefined;
  const page = readSearchPage(search.page);
  const pageSize = readSearchPageSize(search.pageSize);
  if (keyword) result.keyword = keyword;
  if (type) result.type = type;
  if (isActive !== undefined) result.isActive = isActive;
  if (documentCountryCode) result.documentCountryCode = documentCountryCode;
  if (documentType) result.documentType = documentType;
  if (documentNumber !== undefined) result.documentNumber = documentNumber;
  if (page) result.page = page;
  if (pageSize) result.pageSize = pageSize;
  return result;
}

function TenantsRoutePage({
  search,
  session,
}: {
  search: ListRentalTenantsQuery;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();
  const props = createRentalTenantsRoutePageProps(
    { session, navigate, search } as Pick<
      RegisteredPageInput<typeof Route>,
      "navigate" | "search"
    > & {
      session: WebSessionDependency;
    },
    { organizationId, permissions },
  );

  return renderLazyPage(
    <TenantsPage
      {...props}
      onSearchChange={(nextSearch) => void navigate({ search: nextSearch, replace: true } as never)}
      onNavigate={(tenantId) =>
        void navigate({ to: "/rentals/tenants/$tenantId", params: { tenantId } })
      }
    />,
  );
}

function readRentalTenantType(value: unknown): ListRentalTenantsQuery["type"] {
  return value === "individual" || value === "company" ? value : undefined;
}

function readRentalDocumentType(value: unknown): ListRentalTenantsQuery["documentType"] {
  const types = [
    "national_id",
    "passport",
    "residence_permit",
    "business_registration",
    "other",
  ] as const;
  return typeof value === "string" && types.some((type) => type === value)
    ? (value as ListRentalTenantsQuery["documentType"])
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
