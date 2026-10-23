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
import { rentalPropertyBillingPermissions } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import {
  billFixture,
  billsApiFixture,
  financeApiFixture,
} from "@/features/rental/bills/bill-test-fixtures";
import {
  billingPageFixture,
  candidateFixture,
  unpaidBillFixture,
} from "@/features/rental/property-billing/property-billing-test-fixtures";
import { createAppRouter } from "@/router";
import { ApiError } from "@/services/api-client";
import type { RentalApi } from "@/services/rental-api";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";

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
  const menus = [
    menu("RentalProperties", 1),
    menu("RentalPropertyDetail", 2),
    menu("RentalContractDetail", 3),
    menu("RentalBillDetail", 4),
  ];
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
    bookkeepingApi: {} as never,
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

function billingSession() {
  const active = session();
  active.authStore.setState({ permissions: [...rentalPropertyBillingPermissions] });
  let generated = false;
  active.rentalBillsApi = billsApiFixture();
  active.rentalFinanceApi = financeApiFixture({
    listPropertyBilling: vi.fn().mockImplementation(async (input) => {
      if (!input.afterContractId)
        return { ...billingPageFixture, items: [], unpaidBills: [], nextAfterContractId: "100" };
      return {
        ...billingPageFixture,
        unpaidBills: generated
          ? [{ ...unpaidBillFixture, bill: { ...billFixture, amountMinor: 12345 } }]
          : [],
        items: [
          ...(generated ? [] : [candidateFixture]),
          {
            ...candidateFixture,
            contractId: "second",
            contractNumber: "RC-2026-000002",
            spaceId: "room-2",
            path: [
              ...candidateFixture.path.slice(0, -1),
              { id: "room-2", parentId: "floor", name: "302", sortOrder: 1 },
            ],
          },
        ],
      };
    }),
    generatePeriodBill: vi.fn().mockImplementation(async () => {
      generated = true;
      return {
        ...billFixture,
        periodStart: "2026-10-05",
        periodEnd: "2026-11-04",
        amountMinor: 12345,
      };
    }),
  });
  return active;
}
it("房产入口、多页、Sheet、生成回填、其他空间继续，缓存返回保持结果", async () => {
  const active = billingSession();
  const { router } = renderRoute("/rentals/properties", active);
  await userEvent.click(await screen.findByRole("button", { name: "账单" }));
  const button = await screen.findByRole("button", { name: /生成账单 301/ }, { timeout: 5000 });
  expect(router.state.location.search).toEqual({ view: "billing" });
  const url = router.state.location.href;
  await userEvent.click(button);
  await screen.findByLabelText("水表读数");
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("row", { name: /总收费合计/ })).toHaveTextContent("CNY 123.45");
  expect(router.state.location.href).toBe(url);
  await userEvent.click(screen.getByRole("button", { name: /生成账单 302/ }));
  await screen.findByLabelText("水表读数");
  expect(active.rentalFinanceApi.getPeriodBillContext).toHaveBeenLastCalledWith(
    { contractId: "second" },
    expect.anything(),
  );
  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
  await screen.findByRole("heading", { name: "房产管理" });
  await userEvent.click(screen.getByRole("button", { name: "账单" }));
  await screen.findByRole("button", { name: billFixture.billNumber });
  expect(screen.getByRole("row", { name: /总收费合计/ })).toHaveTextContent("CNY 123.45");
});
it.each(
  rentalPropertyBillingPermissions,
)("直接访问 billing 缺少 %s 不请求候选", async (missing) => {
  const active = billingSession();
  active.authStore.setState({
    permissions: rentalPropertyBillingPermissions.filter((p) => p !== missing),
  });
  renderRoute(`/rentals/properties/${propertyId}?view=billing`, active);
  await screen.findByText(/缺少房产出账权限|无权访问/);
  expect(active.rentalFinanceApi.listPropertyBilling).not.toHaveBeenCalled();
});
it("生成期间依据变化不标成功、不自动出下一期", async () => {
  const active = billingSession();
  active.rentalFinanceApi.generatePeriodBill = vi
    .fn()
    .mockRejectedValue(new ApiError(409, "CONFLICT", "changed"));
  renderRoute(`/rentals/properties/${propertyId}?view=billing`, active);
  await userEvent.click(await screen.findByRole("button", { name: /生成账单 301/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByText(/不会自动确认下一期/);
  expect(screen.queryByText("已生成")).not.toBeInTheDocument();
  expect(active.rentalFinanceApi.generatePeriodBill).toHaveBeenCalledTimes(1);
});

it("空间行的合同入口导航到该合同，不打开出账 Sheet", async () => {
  const active = billingSession();
  active.rentalApi.contractDetail = vi
    .fn()
    .mockRejectedValue(new ApiError(404, "NOT_FOUND", "合同不存在"));
  const { router } = renderRoute(`/rentals/properties/${propertyId}?view=billing`, active);
  await userEvent.click(await screen.findByRole("button", { name: "查看合同 RC-2026-000002" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/contracts/second"));
  await waitFor(() => expect(active.rentalApi.contractDetail).toHaveBeenCalledWith("second"));
  expect(active.rentalFinanceApi.getPeriodBillContext).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("房产账单号进入对应账单详情", async () => {
  const active = billingSession();
  active.rentalFinanceApi.listPropertyBilling = vi.fn().mockResolvedValue({
    ...billingPageFixture,
    items: [],
    unpaidBills: [unpaidBillFixture],
  });
  const { router } = renderRoute(`/rentals/properties/${propertyId}?view=billing`, active);
  await userEvent.click(
    await screen.findByRole("button", { name: unpaidBillFixture.bill.billNumber }),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/bills/old-bill"));
  await waitFor(() => expect(active.rentalBillsApi.getBill).toHaveBeenCalledWith("old-bill"));
});

it("空间行的历史合同号进入其合同详情", async () => {
  const active = billingSession();
  active.rentalFinanceApi.listPropertyBilling = vi.fn().mockResolvedValue({
    ...billingPageFixture,
    items: [],
    unpaidBills: [unpaidBillFixture],
  });
  active.rentalApi.contractDetail = vi
    .fn()
    .mockRejectedValue(new ApiError(404, "NOT_FOUND", "合同不存在"));
  const { router } = renderRoute(`/rentals/properties/${propertyId}?view=billing`, active);
  await userEvent.click(await screen.findByRole("button", { name: "查看合同 RC-2026-000009" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/rentals/contracts/old-contract"),
  );
  await waitFor(() => expect(active.rentalApi.contractDetail).toHaveBeenCalledWith("old-contract"));
  expect(active.rentalFinanceApi.getPeriodBillContext).not.toHaveBeenCalled();
});
