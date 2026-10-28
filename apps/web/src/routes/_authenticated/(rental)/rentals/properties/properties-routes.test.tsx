import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
import { ApiError } from "@/services/api-client";
import type { RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";
import { Route as PropertyDetailRoute, validatePropertyDetailSearch } from "./$propertyId";
import { Route as PropertiesRoute, validateRentalPropertiesSearch } from "./index";

const propertyId = "123e4567-e89b-42d3-a456-426614174000";
const property: RentalPropertyDetail = {
  id: propertyId,
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
    organizationsApi: {} as WebSessionDependency["organizationsApi"],
    authApi: { listOrganizations: vi.fn().mockResolvedValue([]) } as never,
    authStore: createAuthStore({
      status: "authenticated",
      currentOrganization: {
        status: "active",
        baseCurrency: "CNY",
        timezone: "Asia/Shanghai",
        id: "org-1",
        name: "组织",
      },
      permissions: [
        "rental_properties:read",
        "rental_contracts:create",
        "rental_contracts:read",
        "rental_contracts:update",
      ] as PermissionKey[],
    }),
    iamApi: {
      getAuthorizedMenus: vi.fn().mockResolvedValue(menus),
      resolveMenuRoute: vi.fn(),
    } as never,
    menuStore,
    rentalBillsApi: {} as WebSessionDependency["rentalBillsApi"],
    rentalFinanceApi: {} as WebSessionDependency["rentalFinanceApi"],
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
  it("直接打开详情时显示面包屑，返回按钮回到房产列表", async () => {
    const { router } = renderRoute(`/rentals/properties/${propertyId}`);
    await screen.findByRole("heading", { name: property.name, level: 1 });
    const breadcrumb = screen.getByRole("navigation", { name: "面包屑" });
    expect(within(breadcrumb).getByRole("link", { name: "房产管理" })).toHaveAttribute(
      "href",
      "/rentals/properties",
    );
    expect(within(breadcrumb).getByText("房产详情")).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/properties"));
    expect(await screen.findByRole("heading", { name: "房产管理" })).toBeInTheDocument();
  });

  it("从其他详情进入时返回实际上一页，并保留上一页的筛选", async () => {
    const { router } = renderRoute("/rentals/properties/previous?spaceKeyword=101");
    await screen.findByRole("heading", { name: property.name });
    await act(async () => {
      await router.navigate({
        to: "/rentals/properties/$propertyId",
        params: { propertyId },
      });
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/rentals/properties/${propertyId}`),
    );
    await userEvent.click(await screen.findByRole("button", { name: "返回上一页" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/rentals/properties/previous"),
    );
    expect(router.state.location.search).toMatchObject({ spaceKeyword: "101" });
  });

  it("直接访问返回列表后，再次打开缓存详情仍能返回列表", async () => {
    const { router } = renderRoute(`/rentals/properties/${propertyId}`);
    await screen.findByRole("heading", { name: property.name });
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await screen.findByRole("heading", { name: "房产管理" });
    const propertiesTable = await screen.findByRole("table");
    await userEvent.click(
      await within(propertiesTable).findByRole("link", { name: property.name }),
    );
    await screen.findByRole("heading", { name: property.name });
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/properties"));
    expect(await screen.findByRole("heading", { name: "房产管理" })).toBeInTheDocument();
  });

  it("面包屑始终前往房产列表，不受访问来源影响", async () => {
    const { router } = renderRoute("/rentals/properties/previous");
    await screen.findByRole("heading", { name: property.name });
    await act(async () => {
      await router.navigate({ to: "/rentals/properties/$propertyId", params: { propertyId } });
    });
    const breadcrumb = await screen.findByRole("navigation", { name: "面包屑" });
    await userEvent.click(within(breadcrumb).getByRole("link", { name: "房产管理" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/properties"));
  });

  it("加载中仍可通过返回按钮离开详情", async () => {
    const { router } = renderRoute(
      `/rentals/properties/${propertyId}`,
      session({ getProperty: vi.fn(() => new Promise<RentalPropertyDetail>(() => {})) }),
    );
    await screen.findByText("正在加载房产详情...");
    expect(screen.getByRole("navigation", { name: "面包屑" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/properties"));
  });

  it.each([
    [new ApiError(404, "NOT_FOUND", "missing"), "房产不存在或已被删除。"],
    [new Error("offline"), "加载房产详情失败，请稍后重试。"],
  ])("详情请求失败后保留导航出口：%s", async (error, message) => {
    const { router } = renderRoute(
      `/rentals/properties/${propertyId}`,
      session({ getProperty: vi.fn().mockRejectedValue(error) }),
    );
    await screen.findByText(message);
    expect(screen.getByRole("heading", { name: "房产详情", level: 1 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/properties"));
  });

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
    await user.click(screen.getByRole("button", { name: "查询" }));
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

describe("property detail filter URL", () => {
  it("restores independent contract and space filters and validates date ranges", () => {
    expect(
      validatePropertyDetailSearch({
        keyword: "  陈  ",
        status: "active",
        startDateFrom: "2026-10-01",
        startDateTo: "2026-10-31",
        spaceKeyword: " 401 ",
        spaceEffectiveStatus: "active",
        spaceLeaseStatus: "expiring_soon",
        page: "2",
        pageSize: "10",
      }),
    ).toEqual({
      keyword: "陈",
      status: "active",
      startDateFrom: "2026-10-01",
      startDateTo: "2026-10-31",
      spaceKeyword: "401",
      spaceEffectiveStatus: "active",
      spaceLeaseStatus: "expiring_soon",
      page: 2,
      pageSize: 10,
    });
    expect(
      validatePropertyDetailSearch({
        status: "unknown",
        spaceEffectiveStatus: "unknown",
        spaceLeaseStatus: "unknown",
        startDateFrom: "2026-11-01",
        startDateTo: "2026-10-01",
        endDateFrom: "invalid",
        page: -1,
        pageSize: 101,
      }),
    ).toEqual({});
  });
});

it("restores property-scoped contract keyword, date range and status from the detail URL", async () => {
  const activeSession = session();
  renderRoute(
    `/rentals/properties/${propertyId}?keyword=401&status=active&startDateFrom=2026-10-01&startDateTo=2026-10-31&page=2&pageSize=20`,
    activeSession,
  );
  await waitFor(() =>
    expect(activeSession.rentalApi.listContracts).toHaveBeenCalledWith({
      propertyId,
      keyword: "401",
      status: "active",
      startDateFrom: "2026-10-01",
      startDateTo: "2026-10-31",
      page: 2,
      pageSize: 20,
    }),
  );
});

it("billing view 是唯一合法枚举", () => {
  expect(validatePropertyDetailSearch({ view: "billing" })).toEqual({ view: "billing" });
  expect(validatePropertyDetailSearch({ view: "other" })).toEqual({});
});
