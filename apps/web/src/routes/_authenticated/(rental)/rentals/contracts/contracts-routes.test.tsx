import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { act, render, waitFor } from "@testing-library/react";
import type { AuthorizedMenuNode, PermissionKey, RouteKey } from "@xpense/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { createAppRouter } from "@/router";
import type { RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";
import {
  Route as ContractDetailRoute,
  createRentalContractDetailRoutePageProps,
} from "./$contractId";
import {
  Route as ContractsRoute,
  createRentalContractsRoutePageProps,
  validateRentalContractsSearch,
} from "./index";
import {
  Route as ContractCreateRoute,
  createRentalContractCreateRoutePageProps,
  validateRentalContractCreateSearch,
} from "./new";

const captures = vi.hoisted(() => ({
  contractFormProps: null as Record<string, unknown> | null,
  contractsProps: null as Record<string, unknown> | null,
}));

vi.mock("@/features/rental/contracts/contract-form-page", () => ({
  ContractFormPage: (props: Record<string, unknown>) => {
    captures.contractFormProps = props;
    return null;
  },
}));

vi.mock("@/features/rental/contracts/contracts-page", () => ({
  ContractsPage: (props: Record<string, unknown>) => {
    captures.contractsProps = props;
    return null;
  },
}));

vi.mock("@/features/rental/contracts/contract-detail-page", () => ({
  ContractDetailPage: () => null,
}));

const ledgerId = "123e4567-e89b-42d3-a456-426614174000";
const accountId = "223e4567-e89b-42d3-a456-426614174000";
const categoryId = "323e4567-e89b-42d3-a456-426614174000";
const contractId = "423e4567-e89b-42d3-a456-426614174000";

function menu(routeKey: RouteKey, id: number): AuthorizedMenuNode {
  return {
    id,
    parentId: null,
    type: "menu",
    name: routeKey,
    sortOrder: id,
    icon: null,
    isVisible: true,
    routeKey,
    path: `/${routeKey}`,
    url: null,
    permissionCode: null,
    isExternal: false,
    keepAlive: true,
    children: [],
  } as unknown as AuthorizedMenuNode;
}

function session(
  permissions: PermissionKey[] = ["rental_contracts:read", "rental_contracts:create"],
): WebSessionDependency {
  const menus = [menu("RentalContracts", 1), menu("RentalContractDetail", 2)];
  const menuStore = createMenuStore();
  menuStore.setState({
    organizationId: "org-1",
    status: "ready",
    tree: menus,
    byRouteKey: Object.fromEntries(menus.map((item) => [item.routeKey, item])),
    error: null,
  });
  return {
    authApi: { listOrganizations: vi.fn().mockResolvedValue([]) } as never,
    authStore: createAuthStore({
      status: "authenticated",
      currentOrganization: { id: "org-1", name: "组织" },
      permissions,
    }),
    bookkeepingApi: {} as never,
    iamApi: {
      getAuthorizedMenus: vi.fn().mockResolvedValue(menus),
      resolveMenuRoute: vi.fn().mockResolvedValue(menus[0]),
    } as never,
    menuStore,
    rentalApi: {
      listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as unknown as RentalApi,
    restoreSession: vi.fn().mockResolvedValue(true),
  };
}

describe("rental contract file routes", () => {
  afterEach(() => {
    captures.contractFormProps = null;
    captures.contractsProps = null;
  });

  it("normalizes valid and invalid list search values", () => {
    expect(
      validateRentalContractsSearch({
        keyword: "  合同  ",
        propertyId: ` ${accountId} `,
        tenantId: ` ${ledgerId} `,
        status: "active",
        startDateFrom: "2026-01-01",
        startDateTo: "2026-12-31",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      keyword: "合同",
      propertyId: accountId,
      tenantId: ledgerId,
      status: "active",
      startDateFrom: "2026-01-01",
      startDateTo: "2026-12-31",
      page: 2,
      pageSize: 50,
    });
    expect(
      validateRentalContractsSearch({
        keyword: " ",
        propertyId: "bad",
        status: "bad",
        startDateFrom: "2027-01-01",
        startDateTo: "2026-01-01",
        page: 0,
        pageSize: 101,
      }),
    ).toEqual({});
  });

  it("normalizes create seeds by trimming, filtering UUIDs, and stable deduplication", () => {
    expect(
      validateRentalContractCreateSearch({
        draftId: ` ${ledgerId} `,
        propertyId: ` ${accountId} `,
        spaceIds: [ledgerId, ` ${ledgerId} `, "not-a-uuid", categoryId],
      }),
    ).toEqual({ draftId: ledgerId, propertyId: accountId, spaceIds: [ledgerId, categoryId] });
    expect(validateRentalContractCreateSearch({ spaceId: ledgerId })).toEqual({});
    expect(validateRentalContractCreateSearch({ propertyId: "bad", spaceIds: [ledgerId] })).toEqual(
      {},
    );
  });

  it("keeps route URLs, route keys, props, and create metadata distinct", async () => {
    expect((ContractsRoute.options as { path?: string }).path).toBe("/rentals/contracts/");
    expect((ContractDetailRoute.options as { path?: string }).path).toBe(
      "/rentals/contracts/$contractId",
    );
    expect((ContractCreateRoute.options as { path?: string }).path).toBe("/rentals/contracts/new");
    expect(ContractsRoute.options.staticData).toMatchObject({ routeKey: "RentalContracts" });
    expect(ContractDetailRoute.options.staticData).toMatchObject({
      routeKey: "RentalContractDetail",
    });
    expect(ContractCreateRoute.options.staticData).toMatchObject({
      routeKey: "RentalContractCreate",
    });

    const activeSession = session();
    const navigate = vi.fn();
    const listProps = createRentalContractsRoutePageProps(
      { session: activeSession, search: { keyword: "合同" } } as never,
      { organizationId: "org-1", permissions: ["rental_contracts:read"] },
    );
    expect(listProps).toMatchObject({
      api: activeSession.rentalApi,
      organizationId: "org-1",
      search: { keyword: "合同" },
    });
    const detailProps = createRentalContractDetailRoutePageProps(
      { session: activeSession, navigate, params: { contractId }, search: {} } as never,
      { organizationId: "org-1", permissions: ["rental_contracts:read"] },
    );
    expect(detailProps).toMatchObject({
      api: activeSession.rentalApi,
      contractId,
      organizationId: "org-1",
    });
    const createProps = createRentalContractCreateRoutePageProps(
      { session: activeSession, navigate, search: { propertyId: accountId } } as never,
      { organizationId: "org-1", permissions: ["rental_contracts:create"] },
    );
    expect(createProps).toMatchObject({
      api: activeSession.rentalApi,
      canCreate: true,
      search: { propertyId: accountId },
    });

    const draftId = "523e4567-e89b-42d3-a456-426614174000";
    await createProps.navigate({ search: { draftId }, replace: true });
    await createProps.navigate({
      to: "/rentals/contracts/$contractId",
      params: { contractId },
      replace: true,
    });
    expect(createProps.navigate).not.toBe(navigate);
    expect(navigate).toHaveBeenNthCalledWith(1, { search: { draftId }, replace: true });
    expect(navigate).toHaveBeenNthCalledWith(2, {
      to: "/rentals/contracts/$contractId",
      params: { contractId },
      replace: true,
    });
  });

  it("accepts create access from the RentalContracts menu key", async () => {
    const activeSession = session();
    const registeredMenu = menu("RentalContracts", 1);
    activeSession.menuStore.setState({
      status: "ready",
      organizationId: "org-1",
      tree: [registeredMenu],
      byRouteKey: { RentalContracts: registeredMenu },
      error: null,
    });
    const beforeLoad = ContractCreateRoute.options.beforeLoad as unknown as (
      input: unknown,
    ) => Promise<{ registeredPage?: { cacheParams: object; routeKey: string } }>;
    const result = await beforeLoad({
      context: { session: activeSession },
      location: { href: "/rentals/contracts/new", pathname: "/rentals/contracts/new" },
      params: {},
      search: {},
    });
    expect(result.registeredPage).toMatchObject({
      routeKey: "RentalContractCreate",
      cacheParams: {},
    });
  });

  it("resolves the create menu before redirecting and never renders a forbidden form", async () => {
    const activeSession = session(["rental_contracts:read"]);
    activeSession.menuStore.setState({
      status: "ready",
      organizationId: "org-1",
      tree: [],
      byRouteKey: {},
      error: null,
    });
    const resolveMenuRoute = vi.mocked(activeSession.iamApi.resolveMenuRoute);
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/rentals/contracts/new"] }),
      session: activeSession,
    });
    render(
      <AppProviders queryClient={new QueryClient()}>
        <RouterProviderForTest router={router} />
      </AppProviders>,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/forbidden"));
    expect(router.state.location.pathname).toBe("/forbidden");
    expect(resolveMenuRoute).toHaveBeenCalledWith("/rentals/contracts/new");
    expect(captures.contractFormProps).toBeNull();
  });

  it("renders the create descriptor and navigates non-drafts to detail with replace", async () => {
    const activeSession = session();
    const history = createMemoryHistory({ initialEntries: ["/rentals/contracts/new"] });
    const router = createAppRouter({ history, session: activeSession });
    render(
      <AppProviders queryClient={new QueryClient()}>
        <RouterProviderForTest router={router} />
      </AppProviders>,
    );
    await waitFor(() => expect(captures.contractFormProps).not.toBeNull());
    const formProps = captures.contractFormProps;
    expect(formProps?.search).toEqual({});
    const historyIndex = (history.location.state as { __TSR_index: number }).__TSR_index;
    const onNonDraft = formProps?.onNonDraft;
    expect(typeof onNonDraft).toBe("function");
    await act(async () => {
      (onNonDraft as (detail: { id: string }) => void)({ id: contractId });
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/rentals/contracts/${contractId}`),
    );
    expect(router.state.location.search).toEqual({});
    expect((history.location.state as { __TSR_index: number }).__TSR_index).toBe(historyIndex);
  });

  it("uses the contract ID for detail cache params", async () => {
    const activeSession = session();
    const beforeLoad = ContractDetailRoute.options.beforeLoad as unknown as (
      input: unknown,
    ) => Promise<{ registeredPage?: { cacheParams: object; routeKey: string } }>;
    const result = await beforeLoad({
      context: { session: activeSession },
      location: {
        href: `/rentals/contracts/${contractId}`,
        pathname: `/rentals/contracts/${contractId}`,
      },
      params: { contractId },
      search: {},
    });
    expect(result.registeredPage).toEqual(
      expect.objectContaining({ routeKey: "RentalContractDetail", cacheParams: { contractId } }),
    );
  });

  it("renders list descriptor props and wires replace-search and detail navigation", async () => {
    const activeSession = session();
    const history = createMemoryHistory({
      initialEntries: ["/rentals/contracts?keyword=%E5%90%88%E5%90%8C"],
    });
    const router = createAppRouter({ history, session: activeSession });
    render(
      <AppProviders queryClient={new QueryClient()}>
        <RouterProviderForTest router={router} />
      </AppProviders>,
    );
    await waitFor(() => expect(captures.contractsProps).not.toBeNull());
    const listProps = captures.contractsProps;
    expect(listProps).toMatchObject({
      api: activeSession.rentalApi,
      organizationId: "org-1",
      permissions: ["rental_contracts:read", "rental_contracts:create"],
      search: { keyword: "合同" },
    });
    expect(listProps).not.toHaveProperty("navigate");
    expect(typeof listProps?.onSearchChange).toBe("function");
    expect(typeof listProps?.onNavigate).toBe("function");
    const historyIndex = (history.location.state as { __TSR_index: number }).__TSR_index;
    await act(async () => {
      (listProps?.onSearchChange as (search: { keyword: string }) => void)({ keyword: "新的" });
    });
    await waitFor(() => expect(router.state.location.search).toEqual({ keyword: "新的" }));
    expect((history.location.state as { __TSR_index: number }).__TSR_index).toBe(historyIndex);
    await act(async () => {
      (listProps?.onNavigate as (id: string) => void)(contractId);
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/rentals/contracts/${contractId}`),
    );
  });
});

function RouterProviderForTest({ router }: { router: ReturnType<typeof createAppRouter> }) {
  return <RouterProvider router={router} />;
}
