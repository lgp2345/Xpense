import { createFileRoute, redirect } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { lazy } from "react";
import { useStore } from "zustand";

import type { RegisteredPageInput } from "@/components/layout/page-cache-host";
import type {
  ContractFormPageInput,
  ContractFormSearch,
} from "@/features/rental/contracts/contract-form-page";
import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { readTrimmedSearchString } from "@/routes/-shared/search";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const ContractFormPage = lazy(() =>
  import("@/features/rental/contracts/contract-form-page").then((module) => ({
    default: module.ContractFormPage,
  })),
);

export const Route = createFileRoute("/_authenticated/(rental)/rentals/contracts/new")({
  staticData: { routeKey: "RentalContractCreate" },
  validateSearch: validateRentalContractCreateSearch,
  beforeLoad: async ({ context, location, params, search }) => {
    const access = await requireRegisteredRouteAccess(context, location, "RentalContracts");
    if (!context.session.authStore.getState().permissions.includes("rental_contracts:create")) {
      throw redirect({ to: "/forbidden" });
    }
    return {
      ...access,
      registeredPage: defineRegisteredPage({
        routeKey: "RentalContractCreate",
        cacheParams: params,
        render: ({ session }) => (
          <RentalContractCreateRoutePage search={search} session={session} />
        ),
      }),
    };
  },
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

type RentalRoutePageContext = {
  organizationId: string;
  permissions: readonly PermissionKey[];
};

export type RentalContractCreateSearch = ContractFormSearch;

export type RentalContractCreateRoutePageProps = ContractFormPageInput;

export function createRentalContractCreateRoutePageProps(
  input: Pick<RegisteredPageInput<typeof Route>, "navigate" | "search"> & {
    session: WebSessionDependency;
  },
  context: RentalRoutePageContext,
): RentalContractCreateRoutePageProps {
  return {
    ...context,
    api: input.session.rentalApi,
    canCreate: context.permissions.includes("rental_contracts:create"),
    navigate: (options) => input.navigate(options as never),
    search: input.search,
  };
}

export function validateRentalContractCreateSearch(
  search: Record<string, unknown>,
): RentalContractCreateSearch {
  const draftId = readSearchUuid(search.draftId);
  const propertyId = readSearchUuid(search.propertyId);
  const rawSpaceIds = Array.isArray(search.spaceIds)
    ? search.spaceIds
    : search.spaceId === undefined
      ? []
      : [search.spaceId];
  const spaceIds = [
    ...new Set(rawSpaceIds.map(readSearchUuid).filter((value): value is string => Boolean(value))),
  ];
  return {
    ...(draftId ? { draftId } : {}),
    ...(propertyId ? { propertyId } : {}),
    ...(propertyId && spaceIds.length ? { spaceIds } : {}),
  };
}

function RentalContractCreateRoutePage({
  search,
  session,
}: {
  search: RentalContractCreateSearch;
  session: WebSessionDependency;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? "",
  );
  const navigate = Route.useNavigate();
  const props = createRentalContractCreateRoutePageProps(
    { session, navigate, search },
    { organizationId, permissions },
  );

  return renderLazyPage(
    <ContractFormPage
      {...props}
      onNonDraft={(detail) =>
        void navigate({
          to: "/rentals/contracts/$contractId",
          params: { contractId: detail.id },
          replace: true,
        })
      }
    />,
  );
}

const uuidPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

function readSearchUuid(value: unknown): string | undefined {
  const normalized = readTrimmedSearchString(value);
  return normalized && uuidPattern.test(normalized) ? normalized : undefined;
}
