import { expect, it } from "vitest";
import type { WebSessionDependency } from "@/services/web-session";
import { createRentalSettlementRoutePageProps, Route } from "./$contractId";

it("把实际路由上下文的组织、结算查看权限、合同和 session 财务 API 传入页面", () => {
  const rentalFinanceApi = {} as WebSessionDependency["rentalFinanceApi"];
  const props = createRentalSettlementRoutePageProps(
    {
      session: { rentalFinanceApi } as WebSessionDependency,
      params: { contractId: "contract-a" },
    },
    {
      organizationId: "org-a",
      permissions: ["rental_settlements:read"],
    },
  );

  expect(props).toEqual({
    organizationId: "org-a",
    permissions: ["rental_settlements:read"],
    api: rentalFinanceApi,
    contractId: "contract-a",
  });
  expect(Route.options.staticData).toEqual({ routeKey: "RentalSettlement" });
});
