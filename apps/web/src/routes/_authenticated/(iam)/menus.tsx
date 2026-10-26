import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import { useStore } from "zustand";
import type { MenuSearch } from "@/features/menus/menu-search";

import { requireRegisteredRouteAccess } from "@/routes/-shared/access";
import {
  defineRegisteredPage,
  preloadRegisteredRoutePage,
  RegisteredRouteLeaf,
} from "@/routes/-shared/registered-page";
import { readTrimmedSearchString } from "@/routes/-shared/search";
import { RouteAccessPending } from "@/routes/-shared/status";
import type { WebSessionDependency } from "@/services/web-session";

const MenuManagementPage = lazyRouteComponent(
  () => import("@/features/menus/menu-management-page"),
  "MenuManagementPage",
);

const ROUTE_LABELS = {
  OrganizationSettings: "组织设置",
  Dashboard: "仪表盘",
  Members: "成员管理",
  Roles: "角色管理",
  Sessions: "会话管理",
  AuditLogs: "审计日志",
  Menus: "菜单管理",
  RentalProperties: "房产管理",
  RentalPropertyDetail: "房产详情",
  RentalTenants: "租户管理",
  RentalTenantDetail: "租户详情",
  RentalContracts: "合同管理",
  RentalContractDetail: "合同详情",
  RentalBills: "租赁账单",
  RentalBillDetail: "账单详情",
  RentalContractCreate: "新增合同",
  RentalSettlement: "退租结算",
} satisfies Record<RouteKey, string>;

const ROUTE_OPTIONS = (Object.keys(ROUTE_DEFINITIONS) as RouteKey[]).map((key) => ({
  key,
  label: ROUTE_LABELS[key],
  path: ROUTE_DEFINITIONS[key].path,
}));

export const Route = createFileRoute("/_authenticated/(iam)/menus")({
  staticData: { routeKey: "Menus" },
  validateSearch: validateMenuSearch,
  beforeLoad: async ({ context, location, params, search }) => ({
    ...(await preloadRegisteredRoutePage(
      requireRegisteredRouteAccess(context, location, "Menus"),
      MenuManagementPage,
    )),
    registeredPage: defineRegisteredPage({
      routeKey: "Menus",
      cacheParams: params,
      render: ({ session }) => <MenusRoutePage search={search} session={session} />,
    }),
  }),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
});

export function validateMenuSearch(search: Record<string, unknown>): MenuSearch {
  return Object.fromEntries(
    ["name", "destination", "permission"].flatMap((key) => {
      const value = readTrimmedSearchString(search[key]);
      return value ? [[key, value]] : [];
    }),
  );
}

function MenusRoutePage({
  session,
  search,
}: {
  session: WebSessionDependency;
  search: MenuSearch;
}) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const navigate = Route.useNavigate();

  return (
    <MenuManagementPage
      api={session.iamApi}
      permissions={permissions}
      routeOptions={ROUTE_OPTIONS}
      search={search}
      onSearchChange={(nextSearch) => void navigate({ search: nextSearch, replace: true })}
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
    />
  );
}
