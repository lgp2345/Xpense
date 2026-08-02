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

import { MembersPage } from "../features/members/members-page";
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
  "/members": "members.read",
  "/roles": "roles.read",
  "/sessions": "sessions.read",
  "/audit-logs": "audit_logs.read",
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

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context, location }) => requireRouteAccess(context, location),
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
);
const sessionsRoute = createProtectedAdministrationRoute(
  "/sessions",
  protectedRoutePermissions["/sessions"],
  "会话管理",
);
const auditLogsRoute = createProtectedAdministrationRoute(
  "/audit-logs",
  protectedRoutePermissions["/audit-logs"],
  "审计日志",
);

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  forbiddenRoute,
  foundationRoute,
  membersRoute,
  rolesRoute,
  sessionsRoute,
  auditLogsRoute,
]);

function createProtectedAdministrationRoute(
  path: keyof typeof protectedRoutePermissions,
  permission: PermissionKey,
  title: string,
  component?: RouteComponent,
) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    beforeLoad: ({ context, location }) => requireRouteAccess(context, location, permission),
    component: component ?? (() => <AdministrationPlaceholder title={title} />),
  });
}

function MembersRoutePage() {
  const { session } = membersRoute.useRouteContext();
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const isSuperAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const memberPermissions: PermissionKey[] = isSuperAdmin
    ? ["members.create", "members.disable", "members.enable", "members.read", "members.update"]
    : permissions;

  return <MembersPage api={session.iamApi} permissions={memberPermissions} />;
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
  const { session } = indexRoute.useRouteContext();

  return <DashboardPage session={session} />;
}

function ForbiddenRoutePage() {
  const navigate = forbiddenRoute.useNavigate();

  return <ForbiddenPage onBack={() => void navigate({ to: "/" })} />;
}

function AdministrationPlaceholder({ title }: { title: string }) {
  return (
    <main className="min-h-[100dvh] bg-[var(--color-canvas)] p-8 text-[var(--color-ink)]">
      <h1 className="text-3xl font-normal">{title}</h1>
      <p className="mt-4 text-[var(--color-ink-muted)]">此页面将在后续管理任务中完成。</p>
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
        className="grid min-h-[100dvh] place-items-center bg-[var(--color-canvas)] text-sm text-[var(--color-ink-muted)]"
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
