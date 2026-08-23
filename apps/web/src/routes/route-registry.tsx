import {
  type AnyRoute,
  createRootRouteWithContext,
  createRoute,
  notFound,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import {
  type AuthorizedMenuNode,
  ROUTE_DEFINITIONS,
  type RouteKey,
  transactionTypes,
} from "@xpense/shared";
import { lazy, type ReactNode, Suspense } from "react";
import { useStore } from "zustand";

import {
  AuthenticatedLayout,
  type CapturedRegisteredPageInput,
} from "../components/layout/authenticated-layout";
import type { RegisteredPageInput } from "../components/layout/page-cache-host";
import type { AuditLogSearch } from "../features/audit/audit-log-filters";
import { ApiError } from "../services/api-client";
import type { ListTransactionsQuery } from "../services/bookkeeping-api";
import type { WebSessionDependency } from "../services/web-session";

const DashboardPage = lazy(() =>
  import("../pages/dashboard-page").then((module) => ({ default: module.DashboardPage })),
);
const MembersPage = lazy(() =>
  import("../features/members/members-page").then((module) => ({ default: module.MembersPage })),
);
const RolesPage = lazy(() =>
  import("../features/roles/roles-page").then((module) => ({ default: module.RolesPage })),
);
const SessionsPage = lazy(() =>
  import("../features/sessions/sessions-page").then((module) => ({ default: module.SessionsPage })),
);
const AuditLogsPage = lazy(() =>
  import("../features/audit/audit-logs-page").then((module) => ({ default: module.AuditLogsPage })),
);
const MenuManagementPage = lazy(() =>
  import("../features/menus/menu-management-page").then((module) => ({
    default: module.MenuManagementPage,
  })),
);
const TransactionsPlaceholderPage = lazy(() =>
  import("../features/bookkeeping/bookkeeping-route-placeholders").then((module) => ({
    default: module.TransactionsPlaceholderPage,
  })),
);
const AccountsPlaceholderPage = lazy(() =>
  import("../features/bookkeeping/bookkeeping-route-placeholders").then((module) => ({
    default: module.AccountsPlaceholderPage,
  })),
);
const CategoriesPlaceholderPage = lazy(() =>
  import("../features/bookkeeping/bookkeeping-route-placeholders").then((module) => ({
    default: module.CategoriesPlaceholderPage,
  })),
);

export type AppRouterContext = {
  registeredMenu?: AuthorizedMenuNode;
  registeredMenuAuthorization?: object;
  session: WebSessionDependency;
};

export type WebRouteRegistration<TRoute extends AnyRoute = AnyRoute> = {
  label: string;
  route: TRoute;
  render: (input: RegisteredPageInput<TRoute>) => ReactNode;
};

type WebRouteRegistrationConstraint = {
  label: string;
  route: AnyRoute;
  render: (input: never) => ReactNode;
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    routeKey?: RouteKey;
  }
}

export const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: Outlet,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
});

export const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  beforeLoad: ({ context, location }) => requireAuthenticatedRouteAccess(context, location),
  component: AuthenticatedRoutePage,
});

const dashboardRoute = createRegisteredRoute("Dashboard");
const accountsRoute = createRegisteredRoute("Accounts");
const categoriesRoute = createRegisteredRoute("Categories");
const membersRoute = createRegisteredRoute("Members");
const rolesRoute = createRegisteredRoute("Roles");
const sessionsRoute = createRegisteredRoute("Sessions");
const menusRoute = createRegisteredRoute("Menus");
const transactionsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.Transactions.path,
  staticData: { routeKey: "Transactions" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "Transactions"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateTransactionSearch,
});
const auditLogsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.AuditLogs.path,
  staticData: { routeKey: "AuditLogs" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "AuditLogs"),
  component: RegisteredRouteLeaf,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateAuditLogSearch,
});

export const ROUTE_REGISTRY = {
  Dashboard: defineRouteRegistration({
    label: "仪表盘",
    route: dashboardRoute,
    render: (_input) => renderLazyPage(<DashboardPage />),
  }),
  Members: defineRouteRegistration({
    label: "成员管理",
    route: membersRoute,
    render: (input) => renderLazyPage(<MembersPageAdapter input={input} />),
  }),
  Roles: defineRouteRegistration({
    label: "角色管理",
    route: rolesRoute,
    render: (input) => renderLazyPage(<RolesPageAdapter input={input} />),
  }),
  Sessions: defineRouteRegistration({
    label: "会话管理",
    route: sessionsRoute,
    render: (input) => renderLazyPage(<SessionsPageAdapter input={input} />),
  }),
  AuditLogs: defineRouteRegistration({
    label: "审计日志",
    route: auditLogsRoute,
    render: (input) => renderLazyPage(<AuditLogsPageAdapter input={input} />),
  }),
  Menus: defineRouteRegistration({
    label: "菜单管理",
    route: menusRoute,
    render: (input) => renderLazyPage(<MenusPageAdapter input={input} />),
  }),
  Transactions: defineRouteRegistration({
    label: "交易记录",
    route: transactionsRoute,
    render: (input) => renderLazyPage(<TransactionsPageAdapter input={input} />),
  }),
  Accounts: defineRouteRegistration({
    label: "账户管理",
    route: accountsRoute,
    render: (input) => renderLazyPage(<AccountsPageAdapter input={input} />),
  }),
  Categories: defineRouteRegistration({
    label: "分类管理",
    route: categoriesRoute,
    render: (input) => renderLazyPage(<CategoriesPageAdapter input={input} />),
  }),
} satisfies Record<RouteKey, WebRouteRegistrationConstraint>;

const MENU_ROUTE_OPTIONS = (Object.keys(ROUTE_DEFINITIONS) as RouteKey[]).map((key) => ({
  key,
  label: ROUTE_REGISTRY[key].label,
  path: ROUTE_DEFINITIONS[key].path,
}));

function defineRouteRegistration<TRoute extends AnyRoute>(
  registration: WebRouteRegistration<TRoute>,
): WebRouteRegistration<TRoute> {
  return registration;
}

function createRegisteredRoute<const Key extends Exclude<RouteKey, "AuditLogs" | "Transactions">>(
  routeKey: Key,
) {
  return createRoute({
    getParentRoute: () => authenticatedRoute,
    path: ROUTE_DEFINITIONS[routeKey].path,
    staticData: { routeKey },
    beforeLoad: ({ context, location }) =>
      requireRegisteredRouteAccess(context, location, routeKey),
    component: RegisteredRouteLeaf,
    pendingComponent: RouteAccessPending,
    pendingMs: 0,
  });
}

type RouteGuardLocation = {
  href: string;
  pathname: string;
};

export function requireAuthenticatedRouteAccess(
  context: AppRouterContext,
  location: RouteGuardLocation,
): void {
  if (context.session.authStore.getState().status !== "authenticated") {
    throw redirect({
      to: "/login",
      search: { redirect: location.href },
    });
  }
}

async function requireRegisteredRouteAccess(
  context: AppRouterContext,
  location: RouteGuardLocation,
  routeKey: RouteKey,
): Promise<{
  registeredMenu?: AuthorizedMenuNode;
  registeredMenuAuthorization?: object;
}> {
  requireAuthenticatedRouteAccess(context, location);

  const { session } = context;
  const organizationId = session.authStore.getState().currentOrganization?.id ?? null;
  let menuState = session.menuStore.getState();

  if (
    organizationId &&
    menuState.status !== "error" &&
    (menuState.status !== "ready" || menuState.organizationId !== organizationId)
  ) {
    await menuState.loadMenusForOrganization(organizationId, session.iamApi.getAuthorizedMenus);
    menuState = session.menuStore.getState();
  }

  if (menuState.status !== "ready" || menuState.organizationId !== organizationId) {
    return {};
  }

  const registeredMenu = menuState.getAuthorizedRoute(routeKey);

  if (registeredMenu) {
    return { registeredMenu, registeredMenuAuthorization: menuState.byRouteKey };
  }

  try {
    const resolvedRoute = await session.iamApi.resolveMenuRoute(location.pathname);

    if (resolvedRoute.routeKey !== routeKey) {
      throw notFound();
    }

    return {
      registeredMenu: resolvedRoute,
      registeredMenuAuthorization: menuState.byRouteKey,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw redirect({ to: "/forbidden" });
    }
    if (error instanceof ApiError && error.status === 404) {
      throw notFound();
    }
    throw error;
  }
}

function AuthenticatedRoutePage() {
  const { session } = authenticatedRoute.useRouteContext();

  return <AuthenticatedLayout renderRegisteredPage={renderRegisteredPage} session={session} />;
}

function RegisteredRouteLeaf(): null {
  return null;
}

function renderRegisteredPage(input: CapturedRegisteredPageInput): ReactNode {
  switch (input.routeKey) {
    case "Dashboard":
      return ROUTE_REGISTRY.Dashboard.render({
        navigate: input.navigate,
        params: input.params,
        search: input.search,
        session: input.session,
      });
    case "Members":
      return ROUTE_REGISTRY.Members.render({
        navigate: input.navigate,
        params: input.params,
        search: input.search,
        session: input.session,
      });
    case "Roles":
      return ROUTE_REGISTRY.Roles.render({
        navigate: input.navigate,
        params: input.params,
        search: input.search,
        session: input.session,
      });
    case "Sessions":
      return ROUTE_REGISTRY.Sessions.render({
        navigate: input.navigate,
        params: input.params,
        search: input.search,
        session: input.session,
      });
    case "AuditLogs":
      return ROUTE_REGISTRY.AuditLogs.render({
        navigate: input.navigate,
        params: input.params,
        search: validateAuditLogSearch(input.search),
        session: input.session,
      });
    case "Menus":
      return ROUTE_REGISTRY.Menus.render({
        navigate: input.navigate,
        params: input.params,
        search: input.search,
        session: input.session,
      });
    case "Transactions":
      return ROUTE_REGISTRY.Transactions.render({
        navigate: input.navigate,
        params: input.params,
        search: validateTransactionSearch(input.search),
        session: input.session,
      });
    case "Accounts":
      return ROUTE_REGISTRY.Accounts.render({
        navigate: input.navigate,
        params: input.params,
        search: input.search,
        session: input.session,
      });
    case "Categories":
      return ROUTE_REGISTRY.Categories.render({
        navigate: input.navigate,
        params: input.params,
        search: input.search,
        session: input.session,
      });
  }
}

function TransactionsPageAdapter({
  input,
}: {
  input: RegisteredPageInput<typeof transactionsRoute>;
}) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return (
    <TransactionsPlaceholderPage
      api={input.session.bookkeepingApi}
      permissions={permissions}
      search={input.search}
    />
  );
}

function AccountsPageAdapter({ input }: { input: RegisteredPageInput<typeof accountsRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return <AccountsPlaceholderPage api={input.session.bookkeepingApi} permissions={permissions} />;
}

function CategoriesPageAdapter({ input }: { input: RegisteredPageInput<typeof categoriesRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return <CategoriesPlaceholderPage api={input.session.bookkeepingApi} permissions={permissions} />;
}

function MembersPageAdapter({ input }: { input: RegisteredPageInput<typeof membersRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return <MembersPage api={input.session.iamApi} permissions={permissions} />;
}

function RolesPageAdapter({ input }: { input: RegisteredPageInput<typeof rolesRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return <RolesPage api={input.session.iamApi} permissions={permissions} />;
}

function SessionsPageAdapter({ input }: { input: RegisteredPageInput<typeof sessionsRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);
  const currentSessionId = useStore(input.session.authStore, (state) => state.session?.id);

  return (
    <SessionsPage
      api={input.session.authApi}
      currentSessionId={currentSessionId}
      onCurrentSessionRevoked={() => {
        input.session.authStore.getState().clearAuth();
        void input.navigate({ to: "/login", search: { redirect: "/" }, replace: true });
      }}
      permissions={permissions}
    />
  );
}

function AuditLogsPageAdapter({ input }: { input: RegisteredPageInput<typeof auditLogsRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return (
    <AuditLogsPage
      api={input.session.iamApi}
      permissions={permissions}
      search={input.search}
      onSearchChange={(search) => void input.navigate({ search, replace: true })}
    />
  );
}

function MenusPageAdapter({ input }: { input: RegisteredPageInput<typeof menusRoute> }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return (
    <MenuManagementPage
      api={input.session.iamApi}
      permissions={permissions}
      routeOptions={MENU_ROUTE_OPTIONS}
      onAuthorizedMenusRefresh={async () => {
        const organizationId = input.session.authStore.getState().currentOrganization?.id;

        if (!organizationId) {
          throw new Error("Current organization is unavailable");
        }

        await input.session.menuStore
          .getState()
          .loadMenusForOrganization(organizationId, input.session.iamApi.getAuthorizedMenus);

        const menuState = input.session.menuStore.getState();

        if (menuState.status !== "ready" || menuState.organizationId !== organizationId) {
          throw new Error("Authorized menus could not be synchronized");
        }
      }}
    />
  );
}

function renderLazyPage(page: ReactNode): ReactNode {
  return <Suspense fallback={<PageLoading />}>{page}</Suspense>;
}

export function RouteAccessPending() {
  return <RouteStatus>正在验证页面访问权限...</RouteStatus>;
}

function PageLoading() {
  return <RouteStatus>正在加载页面...</RouteStatus>;
}

function RouteStatus({ children }: { children: ReactNode }) {
  return (
    <main
      aria-live="polite"
      className="grid min-h-[50dvh] place-items-center text-sm text-muted-foreground"
    >
      {children}
    </main>
  );
}

function validateAuditLogSearch(search: Record<string, unknown>): AuditLogSearch {
  return {
    action: readSearchString(search.action),
    actorUserId: readSearchString(search.actorUserId),
    from: readSearchDate(search.from),
    page: readSearchPage(search.page),
    targetType: readSearchString(search.targetType),
    to: readSearchDate(search.to),
  };
}

/** 将交易页面 URL 查询参数收敛为服务端支持的筛选字段。 */
function validateTransactionSearch(search: Record<string, unknown>): ListTransactionsQuery {
  const result: ListTransactionsQuery = {};
  const ledgerId = readSearchUuid(search.ledgerId);
  const accountId = readSearchUuid(search.accountId);
  const categoryId = readSearchUuid(search.categoryId);
  const type = readTransactionType(search.type);
  const keyword = readTrimmedSearchString(search.keyword);
  const from = readSearchDate(search.from);
  const to = readSearchDate(search.to);
  const page = readSearchPage(search.page);
  const pageSize = readSearchPageSize(search.pageSize);

  if (ledgerId) result.ledgerId = ledgerId;
  if (accountId) result.accountId = accountId;
  if (categoryId) result.categoryId = categoryId;
  if (type) result.type = type;
  if (keyword) result.keyword = keyword;
  if (!from || !to || from <= to) {
    if (from) result.from = from;
    if (to) result.to = to;
  }
  if (page) result.page = page;
  if (pageSize) result.pageSize = pageSize;

  return result;
}

const uuidPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

/** 按服务端 UUID DTO 的相同边界读取资源 ID。 */
function readSearchUuid(value: unknown): string | undefined {
  const normalized = readTrimmedSearchString(value);
  return normalized && uuidPattern.test(normalized) ? normalized : undefined;
}

/** 读取并修剪非空 URL 字符串。 */
function readTrimmedSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/** 读取普通交易类型，排除内部期初余额类型。 */
function readTransactionType(value: unknown): ListTransactionsQuery["type"] {
  return typeof value === "string" && transactionTypes.some((type) => type === value)
    ? (value as ListTransactionsQuery["type"])
    : undefined;
}

function readSearchString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readSearchDate(value: unknown): string | undefined {
  const date = readSearchString(value);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return undefined;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

function readSearchPage(value: unknown): number | undefined {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

/** 读取服务端允许的分页大小。 */
function readSearchPageSize(value: unknown): number | undefined {
  const pageSize = readSearchPage(value);
  return pageSize !== undefined && pageSize <= 100 ? pageSize : undefined;
}
