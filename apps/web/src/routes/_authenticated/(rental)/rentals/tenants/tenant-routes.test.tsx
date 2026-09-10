import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AuthorizedMenuNode,
  PermissionKey,
  RentalTenantDetail,
  RouteKey,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { createAppRouter } from "@/router";
import type { RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";
import { Route as TenantDetailRoute } from "./$tenantId";
import { Route as TenantsRoute, validateRentalTenantsSearch } from "./index";

const tenantId = "tenant-1";
const tenant = {
  id: tenantId,
  name: "张三",
  type: "individual",
  documentCountryCode: "CN",
  documentType: "national_id",
  documentTypeOtherName: null,
  isActive: true,
  phone: "13800000000",
  email: "a@example.com",
  primaryContactName: "张三",
  primaryContactPhone: "13800000000",
  maskedDocumentNumber: "********1234",
  contractCount: 0,
  note: null,
  updatedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
} as RentalTenantDetail;

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

function session(api: Partial<RentalApi> = {}): WebSessionDependency {
  const menus = [menu("RentalTenants", 1), menu("RentalTenantDetail", 2)];
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
      permissions: [
        "rental_tenants:read",
        "rental_tenants:sensitive_read",
        "rental_tenants:update",
        "rental_tenants:delete",
      ] as PermissionKey[],
    }),
    bookkeepingApi: {} as never,
    iamApi: {
      getAuthorizedMenus: vi.fn().mockResolvedValue(menus),
      resolveMenuRoute: vi.fn(),
    } as never,
    menuStore,
    rentalApi: {
      listTenants: vi.fn().mockResolvedValue({ items: [tenant], total: 1, page: 1, pageSize: 20 }),
      tenantDetail: vi.fn().mockResolvedValue(tenant),
      revealTenantSensitive: vi.fn().mockResolvedValue({
        tenantId,
        documentNumber: "110101199001010011",
        birthDate: null,
        gender: null,
        ethnicity: null,
        documentAddress: null,
      }),
      listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      ...api,
    } as RentalApi,
    restoreSession: vi.fn().mockResolvedValue(true),
  };
}

function renderRoute(path: string, activeSession = session()) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter({
    history,
    session: activeSession,
  });
  render(
    <AppProviders queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { history, router, session: activeSession };
}

describe("rental tenant file routes", () => {
  it("normalizes valid and invalid tenant search values", () => {
    expect(
      validateRentalTenantsSearch({
        keyword: "  租户 ",
        type: "individual",
        isActive: "false",
        documentCountryCode: "CN",
        documentType: "national_id",
        documentNumber: "  raw  ",
        page: "2",
      }),
    ).toEqual({
      keyword: "租户",
      type: "individual",
      isActive: false,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentNumber: "  raw  ",
      page: 2,
    });
    expect(
      validateRentalTenantsSearch({
        type: "bad",
        documentType: "bad",
        isActive: "maybe",
        page: 0,
        pageSize: 101,
      }),
    ).toEqual({});
  });

  it("maps list/detail URLs, replaces search, and preserves exact tenant ID", async () => {
    const user = userEvent.setup();
    const {
      history,
      router,
      session: activeSession,
    } = renderRoute("/rentals/tenants?keyword=%E7%A7%9F%E6%88%B7");
    expect((TenantsRoute.options as { path?: string }).path).toBe("/rentals/tenants/");
    expect((TenantDetailRoute.options as { path?: string }).path).toBe(
      "/rentals/tenants/$tenantId",
    );
    expect(await screen.findByRole("heading", { name: "租客管理" })).toBeInTheDocument();
    const historyLength = history.length;
    const historyIndex = (history.location.state as { __TSR_index: number }).__TSR_index;
    await user.type(screen.getByLabelText("关键词"), "A");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ keyword: "租户A" }));
    expect((history.location.state as { __TSR_index: number }).__TSR_index).toBe(historyIndex);
    expect(history.length).toBe(historyLength);
    await router.navigate({ to: "/rentals/tenants/$tenantId", params: { tenantId } });
    expect(await screen.findByRole("heading", { name: tenant.name })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/rentals/tenants/${tenantId}`);
    expect(activeSession.rentalApi.tenantDetail).toHaveBeenCalledWith(tenantId);
  });

  it("keeps separate cached detail instances and restores each local reveal state by ID", async () => {
    const tenantA = { ...tenant, id: "tenant-a", name: "租客 A" };
    const tenantB = { ...tenant, id: "tenant-b", name: "租客 B" };
    const activeSession = session({
      tenantDetail: vi
        .fn()
        .mockImplementation(async (id: string) => (id === tenantA.id ? tenantA : tenantB)),
      revealTenantSensitive: vi.fn().mockImplementation(async ({ id }: { id: string }) => ({
        tenantId: id,
        documentNumber: `${id}-document`,
        birthDate: null,
        gender: null,
        ethnicity: null,
        documentAddress: null,
      })),
    });
    const { router } = renderRoute("/rentals/tenants/tenant-a", activeSession);
    const tenantAHeading = await screen.findByRole("heading", { name: tenantA.name });
    await userEvent.setup().click(screen.getByRole("button", { name: "编辑" }));
    const tenantANameInput = await screen.findByLabelText("租客名称");
    await userEvent.setup().clear(tenantANameInput);
    await userEvent.setup().type(tenantANameInput, "租客 A 编辑状态");
    await router.navigate({
      to: "/rentals/tenants/$tenantId",
      params: { tenantId: tenantB.id },
    });
    const tenantBHeading = await screen.findByRole("heading", { name: tenantB.name });
    await userEvent.setup().click(screen.getByRole("button", { name: "编辑" }));
    const tenantBNameInput = Array.from(
      document.querySelectorAll<HTMLInputElement>("input#name"),
    ).find((input) => input !== tenantANameInput);
    expect(tenantBNameInput).toBeDefined();
    if (!tenantBNameInput) throw new Error("tenant B local input was not rendered");
    await userEvent.setup().clear(tenantBNameInput);
    await userEvent.setup().type(tenantBNameInput, "租客 B 编辑状态");
    await router.navigate({
      to: "/rentals/tenants/$tenantId",
      params: { tenantId: tenantA.id },
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/rentals/tenants/${tenantA.id}`),
    );
    expect(screen.getByRole("heading", { name: tenantA.name, hidden: true })).toBe(tenantAHeading);
    expect(screen.getByRole("heading", { name: tenantB.name, hidden: true })).toBe(tenantBHeading);
    expect(tenantANameInput).toBeInTheDocument();
    expect(tenantBNameInput).toBeInTheDocument();
    expect(tenantANameInput).toHaveValue("租客 A 编辑状态");
    expect(tenantBNameInput).toHaveValue("租客 B 编辑状态");
  });
});
