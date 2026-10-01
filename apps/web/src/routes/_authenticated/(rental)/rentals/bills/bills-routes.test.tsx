import { expect, it } from "vitest";
import type { WebSessionDependency } from "@/services/web-session";
import { createRentalBillDetailRoutePageProps, Route as DetailRoute } from "./$billId";
import { Route as ListRoute } from "./index";

it("列表与详情使用已登记懒加载页面", () => {
  expect(ListRoute.options.staticData?.routeKey).toBe("RentalBills");
  expect(DetailRoute.options.staticData?.routeKey).toBe("RentalBillDetail");
  expect(ListRoute.options.beforeLoad).toBeTypeOf("function");
  expect(DetailRoute.options.beforeLoad).toBeTypeOf("function");
});

it("把当前会话的财务 API 注入账单详情页", () => {
  const activeSession = {
    rentalBillsApi: {},
    rentalFinanceApi: {},
  } as WebSessionDependency;
  const props = createRentalBillDetailRoutePageProps(
    {
      session: activeSession,
      navigate: (() => undefined) as never,
      params: { billId: "bill-1" },
      search: {},
    } as never,
    { organizationId: "org-1", permissions: ["rental_bills:read"] },
  );

  expect(props).toMatchObject({
    api: activeSession.rentalBillsApi,
    financeApi: activeSession.rentalFinanceApi,
    billId: "bill-1",
    organizationId: "org-1",
  });
});
