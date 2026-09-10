import { useQueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory, RouterProvider } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { didBookkeepingScopeChange } from "@/routes/-shared/bookkeeping-cache-scope";
import { didRentalScopeChange } from "@/routes/-shared/rental-cache-scope";
import { RouteAccessPending } from "@/routes/-shared/status";
import { routeTree } from "./routeTree.gen";
import { clearBookkeepingQueries } from "./services/bookkeeping-query";
import { clearRentalQueries } from "./services/rental-query";
import { type WebSessionDependency, webSession } from "./services/web-session";
import type { AuthStoreApi } from "./stores/auth-store";
import type { MenuStoreApi } from "./stores/menu-store";

export type CreateAppRouterOptions = {
  history?: RouterHistory;
  session?: WebSessionDependency;
};

const sessionsByRouter = new WeakMap<object, WebSessionDependency>();

function NotFoundPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background p-8 text-foreground">
      <div className="text-center">
        <h1 className="text-3xl font-normal">页面不存在</h1>
        <p className="mt-4 text-muted-foreground">请检查地址后重试。</p>
      </div>
    </main>
  );
}

export function createAppRouter(options: CreateAppRouterOptions = {}) {
  const routerSession = options.session ?? webSession;
  const appRouter = createRouter({
    routeTree,
    context: { session: routerSession },
    history: options.history,
    trailingSlash: "never",
    defaultNotFoundComponent: NotFoundPage,
    defaultPendingComponent: RouteAccessPending,
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

export type AppRouterProps = {
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
  const queryClient = useQueryClient();

  useEffect(() => {
    let isActive = true;
    let restore = restoreRef.current;

    clearBookkeepingQueries(queryClient);
    clearRentalQueries(queryClient);

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
  }, [activeRestoreSession, activeRouter, queryClient]);

  useEffect(() => {
    const unsubscribeAuth = activeSession.authStore.subscribe((state, previousState) => {
      if (didBookkeepingScopeChange(state, previousState)) {
        clearBookkeepingQueries(queryClient);
      }
      if (didRentalScopeChange(state, previousState)) {
        clearRentalQueries(queryClient);
      }
      if (didAuthenticatedRouteBoundaryChange(state, previousState)) {
        void activeRouter.invalidate();
      }
    });
    const unsubscribeMenus = activeSession.menuStore.subscribe((state, previousState) => {
      if (didMenuRouteBoundaryChange(state, previousState)) {
        queueMicrotask(() => {
          if (hasActiveRegisteredMenuRoute(activeRouter)) {
            void activeRouter.invalidate({ forcePending: true });
          }
        });
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeMenus();
    };
  }, [activeRouter, activeSession, queryClient]);

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

function hasActiveRegisteredMenuRoute(routerInstance: AppRouterInstance): boolean {
  return routerInstance.state.matches.some((match) => match.staticData.routeKey !== undefined);
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

  if (
    state.currentUser?.isSuperAdmin !== previousState.currentUser?.isSuperAdmin ||
    state.currentOrganization?.id !== previousState.currentOrganization?.id
  ) {
    return true;
  }

  return (
    state.permissions.length !== previousState.permissions.length ||
    state.permissions.some((permission, index) => permission !== previousState.permissions[index])
  );
}

function didMenuRouteBoundaryChange(
  state: ReturnType<MenuStoreApi["getState"]>,
  previousState: ReturnType<MenuStoreApi["getState"]>,
): boolean {
  return (
    (previousState.status === "ready" || previousState.status === "error") &&
    state.status === "loading"
  );
}
