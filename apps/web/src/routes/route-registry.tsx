import {
  type AnyRoute,
  createRootRouteWithContext,
  createRoute,
  type NavigateFn,
  notFound,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import { lazy, type ReactNode, Suspense } from "react";
import { useStore } from "zustand";

import { AuthenticatedLayout } from "../components/layout/authenticated-layout";
import type { AuditLogSearch } from "../features/audit/audit-log-filters";
import { ApiError } from "../services/api-client";
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

export type AppRouterContext = {
  session: WebSessionDependency;
};

export type RegisteredPageInput = {
  session: WebSessionDependency;
  params: Record<string, string>;
  search: Record<string, unknown>;
  navigate: NavigateFn;
};

export type WebRouteRegistration = {
  label: string;
  route: AnyRoute;
  render: (input: RegisteredPageInput) => ReactNode;
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
const membersRoute = createRegisteredRoute("Members");
const rolesRoute = createRegisteredRoute("Roles");
const sessionsRoute = createRegisteredRoute("Sessions");
const menusRoute = createRegisteredRoute("Menus");
const auditLogsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_DEFINITIONS.AuditLogs.path,
  staticData: { routeKey: "AuditLogs" },
  beforeLoad: ({ context, location }) =>
    requireRegisteredRouteAccess(context, location, "AuditLogs"),
  component: () => <RegisteredRoutePage routeKey="AuditLogs" />,
  pendingComponent: RouteAccessPending,
  pendingMs: 0,
  validateSearch: validateAuditLogSearch,
});

export const ROUTE_REGISTRY = {
  Dashboard: {
    label: "仪表盘",
    route: dashboardRoute,
    render: (_input: RegisteredPageInput) => renderLazyPage(<DashboardPage />),
  },
  Members: {
    label: "成员管理",
    route: membersRoute,
    render: (input) => renderLazyPage(<MembersPageAdapter input={input} />),
  },
  Roles: {
    label: "角色管理",
    route: rolesRoute,
    render: (input) => renderLazyPage(<RolesPageAdapter input={input} />),
  },
  Sessions: {
    label: "会话管理",
    route: sessionsRoute,
    render: (input) => renderLazyPage(<SessionsPageAdapter input={input} />),
  },
  AuditLogs: {
    label: "审计日志",
    route: auditLogsRoute,
    render: (input) => renderLazyPage(<AuditLogsPageAdapter input={input} />),
  },
  Menus: {
    label: "菜单管理",
    route: menusRoute,
    render: (_input: RegisteredPageInput) => <AdministrationPlaceholder title="菜单管理" />,
  },
} satisfies Record<RouteKey, WebRouteRegistration>;

function createRegisteredRoute<const Key extends Exclude<RouteKey, "AuditLogs">>(routeKey: Key) {
  return createRoute({
    getParentRoute: () => authenticatedRoute,
    path: ROUTE_DEFINITIONS[routeKey].path,
    staticData: { routeKey },
    beforeLoad: ({ context, location }) =>
      requireRegisteredRouteAccess(context, location, routeKey),
    component: () => <RegisteredRoutePage routeKey={routeKey} />,
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
): Promise<void> {
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
    return;
  }

  if (menuState.getAuthorizedRoute(routeKey)) {
    return;
  }

  try {
    const resolvedRoute = await session.iamApi.resolveMenuRoute(location.pathname);

    if (resolvedRoute.routeKey !== routeKey) {
      throw notFound();
    }
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

function useRegisteredPageInput(route: AnyRoute): RegisteredPageInput {
  const { session } = route.useRouteContext() as AppRouterContext;

  return {
    session,
    params: route.useParams() as Record<string, string>,
    search: route.useSearch() as Record<string, unknown>,
    navigate: route.useNavigate() as NavigateFn,
  };
}

function AuthenticatedRoutePage() {
  const { session } = authenticatedRoute.useRouteContext();

  return <AuthenticatedLayout session={session} />;
}

function RegisteredRoutePage({ routeKey }: { routeKey: RouteKey }) {
  const registration: WebRouteRegistration = ROUTE_REGISTRY[routeKey];
  return registration.render(useRegisteredPageInput(registration.route));
}

function MembersPageAdapter({ input }: { input: RegisteredPageInput }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return <MembersPage api={input.session.iamApi} permissions={permissions} />;
}

function RolesPageAdapter({ input }: { input: RegisteredPageInput }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return <RolesPage api={input.session.iamApi} permissions={permissions} />;
}

function SessionsPageAdapter({ input }: { input: RegisteredPageInput }) {
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

function AuditLogsPageAdapter({ input }: { input: RegisteredPageInput }) {
  const permissions = useStore(input.session.authStore, (state) => state.permissions);

  return (
    <AuditLogsPage
      api={input.session.iamApi}
      permissions={permissions}
      search={input.search as AuditLogSearch}
      onSearchChange={(search) => void input.navigate({ to: "/audit-logs", search, replace: true })}
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

function AdministrationPlaceholder({ title }: { title: string }) {
  return (
    <main className="min-h-[100dvh] bg-background p-8 text-foreground">
      <h1 className="text-3xl font-normal">{title}</h1>
      <p className="mt-4 text-muted-foreground">此页面将在后续管理任务中完成。</p>
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
