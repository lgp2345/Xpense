import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AuthorizedMenuNode,
  PermissionKey,
  RentalPropertyDetail,
  RouteKey,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { createAppRouter } from "@/router";
import type { RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";
import { Route as PropertyDetailRoute } from "./$propertyId";
import { Route as PropertiesRoute, validateRentalPropertiesSearch } from "./index";

const propertyId = "123e4567-e89b-42d3-a456-426614174000";
const property: RentalPropertyDetail = {
  id: propertyId,
  ledgerId: "ledger-1",
  name: "阳光公寓",
  type: "apartment_building",
  customTypeName: null,
  countryCode: "CN",
  isActive: true,
  province: "广东省",
  city: "深圳市",
  district: "南山区",
  addressLine: "科技园 1 号",
  note: null,
  spaceCount: 1,
  rentableSpaceCount: 1,
  activeContractCount: 0,
  upcomingContractCount: 0,
  expiringSoonContractCount: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

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
  const menus = [menu("RentalProperties", 1), menu("RentalPropertyDetail", 2)];
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
        "rental_properties:read",
        "rental_contracts:create",
        "rental_contracts:read",
        "rental_contracts:update",
      ] as PermissionKey[],
    }),
    bookkeepingApi: {} as never,
    iamApi: {
      getAuthorizedMenus: vi.fn().mockResolvedValue(menus),
      resolveMenuRoute: vi.fn(),
    } as never,
    menuStore,
    rentalApi: {
      listProperties: vi
        .fn()
        .mockResolvedValue({ items: [property], total: 1, page: 1, pageSize: 20 }),
      getProperty: vi.fn().mockResolvedValue(property),
      listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
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

describe("rental property file routes", () => {
  it("normalizes valid and invalid search values", () => {
    expect(
      validateRentalPropertiesSearch({
        keyword: "  阳光  ",
        type: "apartment_building",
        isActive: "false",
        province: "广东",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      keyword: "阳光",
      type: "apartment_building",
      isActive: false,
      province: "广东",
      page: 2,
      pageSize: 50,
    });
    expect(
      validateRentalPropertiesSearch({
        keyword: " ",
        type: "bad",
        isActive: "maybe",
        page: 0,
        pageSize: 101,
      }),
    ).toEqual({});
  });

  it("maps URLs and replaces search while retaining the route page", async () => {
    const user = userEvent.setup();
    const {
      history,
      router,
      session: activeSession,
    } = renderRoute("/rentals/properties?keyword=%E9%98%B3%E5%85%89", session());
    expect((PropertiesRoute.options as { path?: string }).path).toBe("/rentals/properties/");
    expect((PropertyDetailRoute.options as { path?: string }).path).toBe(
      "/rentals/properties/$propertyId",
    );
    expect(await screen.findByRole("heading", { name: "房产管理" })).toBeInTheDocument();
    const keyword = screen.getByLabelText("关键词");
    const historyLength = history.length;
    const historyIndex = (history.location.state as { __TSR_index: number }).__TSR_index;
    await user.type(keyword, "A");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ keyword: "阳光A" }));
    expect((history.location.state as { __TSR_index: number }).__TSR_index).toBe(historyIndex);
    expect(history.length).toBe(historyLength);
    expect(activeSession.rentalApi.listProperties).toHaveBeenCalled();
  });

  it("keeps separate cached detail instances and restores each local state by ID", async () => {
    const propertyA = { ...property, id: "property-a", name: "房产 A" };
    const propertyB = { ...property, id: "property-b", name: "房产 B" };
    const activeSession = session({
      getProperty: vi
        .fn()
        .mockImplementation(async (id: string) => (id === propertyA.id ? propertyA : propertyB)),
    });
    const { router } = renderRoute("/rentals/properties/property-a", activeSession);
    const propertyAHeading = await screen.findByRole("heading", { name: propertyA.name });
    const propertyAInput = screen.getByPlaceholderText("按名称或编码搜索空间");
    await userEvent.setup().type(propertyAInput, "alpha");
    await router.navigate({
      to: "/rentals/properties/$propertyId",
      params: { propertyId: propertyB.id },
    });
    const propertyBHeading = await screen.findByRole("heading", { name: propertyB.name });
    const propertyBInput = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[placeholder="按名称或编码搜索空间"]'),
    ).find((input) => input !== propertyAInput);
    expect(propertyBInput).toBeDefined();
    if (!propertyBInput) throw new Error("property B local input was not rendered");
    await userEvent.setup().type(propertyBInput, "beta");
    await router.navigate({
      to: "/rentals/properties/$propertyId",
      params: { propertyId: propertyA.id },
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/rentals/properties/${propertyA.id}`),
    );
    expect(screen.getByRole("heading", { name: propertyA.name, hidden: true })).toBe(
      propertyAHeading,
    );
    expect(screen.getByRole("heading", { name: propertyB.name, hidden: true })).toBe(
      propertyBHeading,
    );
    expect(propertyAInput).toHaveValue("alpha");
    expect(propertyBInput).toHaveValue("beta");
  });
});
