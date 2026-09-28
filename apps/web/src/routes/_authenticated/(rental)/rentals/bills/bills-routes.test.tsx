import { expect, it } from "vitest";
import { Route as DetailRoute } from "./$billId";
import { Route as ListRoute } from "./index";

it("列表与详情使用已登记懒加载页面", () => {
  expect(ListRoute.options.staticData?.routeKey).toBe("RentalBills");
  expect(DetailRoute.options.staticData?.routeKey).toBe("RentalBillDetail");
  expect(ListRoute.options.beforeLoad).toBeTypeOf("function");
  expect(DetailRoute.options.beforeLoad).toBeTypeOf("function");
});
