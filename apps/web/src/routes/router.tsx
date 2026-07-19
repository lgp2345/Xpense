import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  RouterProvider,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";

import { DashboardPage } from "../pages/dashboard-page";
import { ForbiddenPage } from "../pages/forbidden-page";
import { FoundationPage } from "../pages/foundation-page";
import { LoginPage } from "../pages/login-page";
import { restoreCurrentWebSession } from "../services/web-session";
import { type AuthStoreApi, authStore } from "../stores/auth-store";
import { getSafeRedirectPath } from "./safe-redirect";

type AppRouterContext = {
  authStore: AuthStoreApi;
};

type RouteGuardLocation = {
  href: string;
};

type CreateAppRouterOptions = {
  authStore?: AuthStoreApi;
  history?: RouterHistory;
};

const authStoresByRouter = new WeakMap<object, AuthStoreApi>();

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
    if (context.authStore.getState().status === "authenticated") {
      throw redirect({ href: getSafeRedirectPath(search.redirect) });
    }
  },
  component: LoginRoutePage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context, location }) => requireRouteAccess(context, location),
  component: DashboardPage,
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
) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    beforeLoad: ({ context, location }) => requireRouteAccess(context, location, permission),
    component: () => <AdministrationPlaceholder title={title} />,
  });
}

function requireRouteAccess(
  context: AppRouterContext,
  location: RouteGuardLocation,
  permission?: PermissionKey,
): void {
  const state = context.authStore.getState();

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
  const navigate = useNavigate();

  return (
    <LoginPage
      redirectPath={redirectPath}
      onAuthenticated={(path) => navigate({ href: path, replace: true })}
    />
  );
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
  const routerAuthStore = options.authStore ?? authStore;
  const appRouter = createRouter({
    routeTree,
    context: {
      authStore: routerAuthStore,
    },
    history: options.history,
  });

  authStoresByRouter.set(appRouter, routerAuthStore);

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

export function AppRouter({
  router: activeRouter = router,
  restoreSession = restoreCurrentWebSession,
}: AppRouterProps = {}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const restoreRef = useRef<{
    restoreSession: () => Promise<boolean>;
    promise: Promise<boolean>;
  } | null>(null);

  useEffect(() => {
    let isActive = true;
    let restore = restoreRef.current;

    if (!restore || restore.restoreSession !== restoreSession) {
      restore = {
        restoreSession,
        promise: restoreSession().catch(() => false),
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
  }, [restoreSession]);

  useEffect(() => {
    const routerAuthStore = authStoresByRouter.get(activeRouter);

    if (!routerAuthStore) {
      return;
    }

    return routerAuthStore.subscribe((state, previousState) => {
      if (!didAuthenticatedRouteBoundaryChange(state, previousState)) {
        return;
      }

      void activeRouter.invalidate();
    });
  }, [activeRouter]);

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
