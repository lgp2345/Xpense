import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { RouteKey } from "@xpense/shared";
import { type JSX, useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { CommandMenu } from "@/components/command-menu";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { AppRouterContext } from "@/routes/__root";
import type { WebSessionDependency } from "@/services/web-session";

import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { PageCacheHost, type PageCacheHostPage } from "./page-cache-host";
import { getBrowserPageWorkspaceStorage } from "./page-workspace-persistence";

type AuthenticatedLayoutProps = {
  session: WebSessionDependency;
  requiresMenuBootstrap?: boolean;
};

export function AuthenticatedLayout({
  session,
  requiresMenuBootstrap = true,
}: AuthenticatedLayoutProps): JSX.Element {
  const href = useRouterState({
    select: (state) => state.resolvedLocation?.href ?? state.location.href,
  });
  const navigate = useNavigate();
  const leafMatch = useRouterState({ select: (state) => state.matches.at(-1) });
  const leafContext =
    leafMatch?.status === "success" ? (leafMatch.context as AppRouterContext) : undefined;
  const registeredPage = leafContext?.registeredPage;
  const routeKey = leafMatch?.status === "success" ? leafMatch.staticData.routeKey : undefined;
  const validRegisteredPage =
    registeredPage !== undefined && routeKey !== undefined && registeredPage.routeKey === routeKey
      ? registeredPage
      : undefined;
  const activeRegisteredMatch =
    leafMatch?.status === "success" && routeKey !== undefined
      ? {
          registeredMenu: leafMatch.context.registeredMenu,
          registeredMenuAuthorization: leafMatch.context.registeredMenuAuthorization,
          routeKey,
        }
      : null;
  const authStatus = useStore(session.authStore, (state) => state.status);
  const userId = useStore(session.authStore, (state) => state.currentUser?.id ?? null);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? null,
  );
  const menuOrganizationId = useStore(session.menuStore, (state) => state.organizationId);
  const menuStatus = useStore(session.menuStore, (state) => state.status);
  const menuError = useStore(session.menuStore, (state) => state.error);
  const authorizedRoutes = useStore(session.menuStore, (state) => state.byRouteKey);
  const storage = useMemo(() => getBrowserPageWorkspaceStorage(), []);
  const navigateToHref = useCallback(
    (targetHref: string) => navigate({ href: targetHref }),
    [navigate],
  );
  const cacheableMenus = useMemo(
    () =>
      new Map(
        Object.values(authorizedRoutes).flatMap((menu) =>
          menu?.keepAlive === true
            ? ([[menu.routeKey, { id: menu.id, title: menu.name }]] as const)
            : [],
        ),
      ) as ReadonlyMap<RouteKey, { id: number; title: string }>,
    [authorizedRoutes],
  );
  const cacheableMenuIds = useMemo(
    () => new Set([...cacheableMenus.values()].map(({ id }) => id)),
    [cacheableMenus],
  );

  if (authStatus !== "authenticated") {
    return <LayoutStatus>正在验证登录状态...</LayoutStatus>;
  }

  const isMenuReady =
    !requiresMenuBootstrap || (menuStatus === "ready" && menuOrganizationId === organizationId);
  const isMenuError =
    requiresMenuBootstrap && menuStatus === "error" && menuOrganizationId === organizationId;
  const registeredMenu =
    activeRegisteredMatch?.registeredMenuAuthorization === authorizedRoutes
      ? activeRegisteredMatch.registeredMenu
      : undefined;
  const localMenu = activeRegisteredMatch
    ? authorizedRoutes[activeRegisteredMatch.routeKey]
    : undefined;
  const activeMenu = localMenu ?? registeredMenu;
  const activePage: PageCacheHostPage | null =
    isMenuReady && activeMenu && activeRegisteredMatch && validRegisteredPage
      ? {
          authorizationSource: localMenu ? "local" : "resolved",
          href,
          keepAlive: activeMenu.keepAlive === true,
          menuId: activeMenu.id,
          params: validRegisteredPage.cacheParams,
          render: () => validRegisteredPage.render({ session }),
          routeKey: activeRegisteredMatch.routeKey,
          title: activeMenu.name,
        }
      : null;
  const workspaceScope = userId && organizationId ? { organizationId, userId } : null;
  const fallback = isMenuError ? (
    <LayoutContentStatus>
      <p role="alert">{menuError ?? "菜单加载失败，请稍后重试。"}</p>
      <Button
        className="mt-4"
        onClick={() => {
          if (organizationId) {
            void session.menuStore
              .getState()
              .loadMenusForOrganization(organizationId, session.iamApi.getAuthorizedMenus);
          }
        }}
        type="button"
      >
        重试
      </Button>
    </LayoutContentStatus>
  ) : isMenuReady ? (
    <Outlet />
  ) : (
    <LayoutContentStatus>正在加载组织菜单...</LayoutContentStatus>
  );

  return (
    <SidebarProvider>
      <AppSidebar session={session} />
      <SidebarInset>
        <Header />
        <main id="main-content" className="flex min-h-0 flex-1 flex-col">
          <PageCacheHost
            activePage={activePage}
            authorizationVersion={isMenuReady ? authorizedRoutes : null}
            cacheableMenuIds={cacheableMenuIds}
            cacheableMenus={cacheableMenus}
            fallback={fallback}
            navigate={navigateToHref}
            scopeKey={organizationId}
            storage={storage}
            workspaceScope={workspaceScope}
          />
        </main>
      </SidebarInset>
      <CommandMenu session={session} />
    </SidebarProvider>
  );
}

function LayoutStatus({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <main
      aria-live="polite"
      className="grid min-h-[100dvh] place-items-center bg-background text-sm text-muted-foreground"
    >
      <div className="text-center">{children}</div>
    </main>
  );
}

function LayoutContentStatus({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      aria-live="polite"
      className="grid min-h-[50dvh] place-items-center text-sm text-muted-foreground"
      role="status"
    >
      <div className="text-center">{children}</div>
    </div>
  );
}
