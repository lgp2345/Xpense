import { createFileRoute } from "@tanstack/react-router";
import { ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import { lazy } from "react";
import { useStore } from "zustand";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import { defineRegisteredPage, RegisteredRouteLeaf } from "@/routes/-shared/registered-page";
import { RouteAccessPending, renderLazyPage } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const MenuManagementPage = lazy(() =>
  import("@/features/menus/menu-management-page").then((module) => ({
    default: module.MenuManagementPage,
  })),
);

const ROUTE_LABELS = {
  Dashboard: "仪表盘",
  Members: "成员管理",
  Roles: "角色管理",
  Sessions: "会话管理",
  AuditLogs: "审计日志",
  Menus: "菜单管理",
  Transactions: "交易记录",
  Accounts: "账户管理",
  Categories: "分类管理",
  RentalProperties: "房产管理",
  RentalPropertyDetail: "房产详情",
  RentalTenants: "租户管理",
  RentalTenantDetail: "租户详情",
  RentalContracts: "合同管理",
  RentalContractDetail: "合同详情",
  RentalContractCreate: "新增合同",
} satisfies Record<RouteKey, string>;

const ROUTE_OPTIONS = (Object.keys(ROUTE_DEFINITIONS) as RouteKey[]).map((key) => ({
  key,
  label: ROUTE_LABELS[key],
  path: ROUTE_DEFINITIONS[key].path,
}));

export const Route = createFileRoute("/_authenticated/(iam)/menus")({
  staticData: { routeKey: "Menus" },
  beforeLoad: async ({ context, location, params }) => ({
    ...(await requireRegisteredRouteAccess(context, location, "Menus")),
    registeredPage: defineRegisteredPage({
      routeKey: "Menus",
      cacheParams: params,
      render: ({ session }) => <MenusRoutePage session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

function MenusRoutePage({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);

  return renderLazyPage(
    <MenuManagementPage
      api={session.iamApi}
      permissions={permissions}
      routeOptions={ROUTE_OPTIONS}
      onAuthorizedMenusRefresh={async () => {
        const organizationId = session.authStore.getState().currentOrganization?.id;

        if (!organizationId) {
          throw new Error("Current organization is unavailable");
        }

        await session.menuStore
          .getState()
          .loadMenusForOrganization(organizationId, session.iamApi.getAuthorizedMenus);

        const menuState = session.menuStore.getState();
        if (menuState.status !== "ready" || menuState.organizationId !== organizationId) {
          throw new Error("Authorized menus could not be synchronized");
        }
      }}
    />,
  );
}
