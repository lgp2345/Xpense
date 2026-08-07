import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouteComponent,
  type RouterHistory,
  RouterProvider,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { AuthenticatedLayout } from "../components/layout/authenticated-layout";
import type { AuditLogSearch } from "../features/audit/audit-log-filters";
import { AuditLogsPage } from "../features/audit/audit-logs-page";
import { MembersPage } from "../features/members/members-page";
import { RolesPage } from "../features/roles/roles-page";
import { SessionsPage } from "../features/sessions/sessions-page";
import { DashboardPage } from "../pages/dashboard-page";
import { ForbiddenPage } from "../pages/forbidden-page";
import { FoundationPage } from "../pages/foundation-page";
import { LoginPage } from "../pages/login-page";
import { type WebSessionDependency, webSession } from "../services/web-session";
import type { AuthStoreApi } from "../stores/auth-store";
import { getSafeRedirectPath } from "./safe-redirect";

type AppRouterContext = {
  session: WebSessionDependency;
};

type RouteGuardLocation = {
  href: string;
};

type CreateAppRouterOptions = {
  history?: RouterHistory;
  session?: WebSessionDependency;
};

const sessionsByRouter = new WeakMap<object, WebSessionDependency>();

export const protectedRoutePermissions = {
  "/members": "members:read",
  "/roles": "roles:read",
  "/sessions": "sessions:read",
  "/audit-logs": "audit_logs:read",
} as const satisfies Record<string, PermissionKey>;

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  beforeLoad: ({ context, search }) => {
    if (context.session.authStore.getState().status === "authenticated") {
      throw redirect({ href: getSafeRedirectPath(search.redirect) });
    }
  },
  component: LoginRoutePage,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  beforeLoad: ({ context, location }) => requireRouteAccess(context, location),
  component: AuthenticatedRoutePage,
});

const indexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  component: DashboardRoutePage,
});

const foundationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/foundation",
  component: FoundationPage,
});

const forbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forbidden",
  beforeLoad: ({ context, location }) => requireRouteAccess(context, location),
  component: ForbiddenRoutePage,
});

const membersRoute = createProtectedAdministrationRoute(
  "/members",
  protectedRoutePermissions["/members"],
  "成员管理",
  MembersRoutePage,
);
const rolesRoute = createProtectedAdministrationRoute(
  "/roles",
  protectedRoutePermissions["/roles"],
  "角色管理",
  RolesRoutePage,
);
const sessionsRoute = createProtectedAdministrationRoute(
  "/sessions",
  protectedRoutePermissions["/sessions"],
  "会话管理",
  SessionsRoutePage,
);
const auditLogsRoute = createProtectedAdministrationRoute(
  "/audit-logs",
  protectedRoutePermissions["/audit-logs"],
  "审计日志",
  AuditLogsRoutePage,
  validateAuditLogSearch,
);

const routeTree = rootRoute.addChildren([
  loginRoute,
  forbiddenRoute,
  foundationRoute,
  authenticatedRoute.addChildren([
    indexRoute,
    membersRoute,
    rolesRoute,
    sessionsRoute,
    auditLogsRoute,
  ]),
]);

function createProtectedAdministrationRoute(
  path: keyof typeof protectedRoutePermissions,
  permission: PermissionKey,
  title: string,
  component?: RouteComponent,
  validateSearch?: (search: Record<string, unknown>) => AuditLogSearch,
) {
  return createRoute({
    getParentRoute: () => authenticatedRoute,
    path,
    beforeLoad: ({ context, location }) => requireRouteAccess(context, location, permission),
    component: component ?? (() => <AdministrationPlaceholder title={title} />),
    validateSearch,
  });
}

function AuthenticatedRoutePage() {
  const { session } = authenticatedRoute.useRouteContext();

  return <AuthenticatedLayout session={session} />;
}

function MembersRoutePage() {
  const { session } = membersRoute.useRouteContext();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const isSuperAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const memberPermissions: PermissionKey[] = isSuperAdmin
    ? ["members:create", "members:disable", "members:enable", "members:read", "members:update"]
    : permissions;

  return <MembersPage api={session.iamApi} permissions={memberPermissions} />;
}

function RolesRoutePage() {
  const { session } = rolesRoute.useRouteContext();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const isSuperAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const rolePermissions: PermissionKey[] = isSuperAdmin
    ? ["roles:create", "roles:delete", "roles:permissions:update", "roles:read", "roles:update"]
    : permissions;

  return <RolesPage api={session.iamApi} permissions={rolePermissions} />;
}

function SessionsRoutePage() {
  const { session } = sessionsRoute.useRouteContext();
  const navigate = sessionsRoute.useNavigate();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const isSuperAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const currentSessionId = useStore(session.authStore, (state) => state.session?.id);
  const sessionPermissions: PermissionKey[] = isSuperAdmin
    ? ["sessions:read", "sessions:revoke"]
    : permissions;

  return (
    <SessionsPage
      api={session.authApi}
      currentSessionId={currentSessionId}
      onCurrentSessionRevoked={() => {
        session.authStore.getState().clearAuth();
        void navigate({ to: "/login", search: { redirect: "/" }, replace: true });
      }}
      permissions={sessionPermissions}
    />
  );
}

function AuditLogsRoutePage() {
  const { session } = auditLogsRoute.useRouteContext();
  const navigate = auditLogsRoute.useNavigate();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const isSuperAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const search = auditLogsRoute.useSearch();
  const auditLogPermissions: PermissionKey[] = isSuperAdmin ? ["audit_logs:read"] : permissions;

  return (
    <AuditLogsPage
      api={session.iamApi}
      permissions={auditLogPermissions}
      search={search}
      onSearchChange={(nextSearch) => void navigate({ search: nextSearch, replace: true })}
    />
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

function requireRouteAccess(
  context: AppRouterContext,
  location: RouteGuardLocation,
  permission?: PermissionKey,
): void {
  const state = context.session.authStore.getState();

  if (state.status !== "authenticated") {
    throw redirect({
      to: "/login",
      search: { redirect: location.href },
    });
  }

  if (permission && !state.currentUser?.isSuperAdmin && !state.permissions.includes(permission)) {
    throw redirect({ to: "/forbidden" });
  }
}

function LoginRoutePage() {
  const { redirect: redirectPath } = loginRoute.useSearch();
  const { session } = loginRoute.useRouteContext();
  const navigate = useNavigate();

  return (
    <LoginPage
      redirectPath={redirectPath}
      session={session}
      onAuthenticated={(path) => navigate({ href: path, replace: true })}
    />
  );
}

function DashboardRoutePage() {
  return <DashboardPage />;
}

function ForbiddenRoutePage() {
  const navigate = forbiddenRoute.useNavigate();

  return <ForbiddenPage onBack={() => void navigate({ to: "/" })} />;
}

function AdministrationPlaceholder({ title }: { title: string }) {
  return (
    <main className="min-h-[100dvh] bg-background p-8 text-foreground">
      <h1 className="text-3xl font-normal">{title}</h1>
      <p className="mt-4 text-muted-foreground">此页面将在后续管理任务中完成。</p>
    </main>
  );
}

export function createAppRouter(options: CreateAppRouterOptions = {}) {
  const routerSession = options.session ?? webSession;
  const appRouter = createRouter({
    routeTree,
    context: {
      session: routerSession,
    },
    history: options.history,
  });

  sessionsByRouter.set(appRouter, routerSession);

  return appRouter;
}

const router = createAppRouter();
type AppRouterInstance = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

type AppRouterProps = {
  router?: AppRouterInstance;
  restoreSession?: () => Promise<boolean>;
};

export function AppRouter({ router: activeRouter = router, restoreSession }: AppRouterProps = {}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const restoreRef = useRef<{
    router: AppRouterInstance;
    restoreSession: () => Promise<boolean>;
    promise: Promise<boolean>;
  } | null>(null);
  const activeSession = sessionsByRouter.get(activeRouter) ?? webSession;
  const activeRestoreSession = restoreSession ?? activeSession.restoreSession;

  useEffect(() => {
    let isActive = true;
    let restore = restoreRef.current;

    if (
      !restore ||
      restore.router !== activeRouter ||
      restore.restoreSession !== activeRestoreSession
    ) {
      restore = {
        router: activeRouter,
        restoreSession: activeRestoreSession,
        promise: activeRestoreSession().catch(() => false),
      };
      restoreRef.current = restore;
    }

    void restore.promise.finally(() => {
      if (isActive) {
        setIsInitialized(true);
      }
    });

    return () => {
      isActive = false;
    };
  }, [activeRestoreSession, activeRouter]);

  useEffect(() => {
    return activeSession.authStore.subscribe((state, previousState) => {
      if (!didAuthenticatedRouteBoundaryChange(state, previousState)) {
        return;
      }

      void activeRouter.invalidate();
    });
  }, [activeRouter, activeSession]);

  if (!isInitialized) {
    return (
      <main
        className="grid min-h-[100dvh] place-items-center bg-background text-sm text-muted-foreground"
        aria-live="polite"
      >
        正在恢复会话...
      </main>
    );
  }

  return <RouterProvider router={activeRouter} />;
}

function didAuthenticatedRouteBoundaryChange(
  state: ReturnType<AuthStoreApi["getState"]>,
  previousState: ReturnType<AuthStoreApi["getState"]>,
): boolean {
  if (previousState.status !== "authenticated") {
    return false;
  }

  if (state.status !== "authenticated") {
    return true;
  }

  if (state.currentUser?.isSuperAdmin !== previousState.currentUser?.isSuperAdmin) {
    return true;
  }

  return (
    state.permissions.length !== previousState.permissions.length ||
    state.permissions.some((permission, index) => permission !== previousState.permissions[index])
  );
}
