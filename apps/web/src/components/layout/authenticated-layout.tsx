import {
  Outlet,
  type UseNavigateResult,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import type { RouteKey } from "@xpense/shared";
import type { JSX, ReactNode } from "react";
import { useStore } from "zustand";

import { CommandMenu } from "@/components/command-menu";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { WebSessionDependency } from "@/services/web-session";

import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { PageCacheHost, type PageCacheHostPage } from "./page-cache-host";

export type CapturedRegisteredPageInput = {
  navigate: UseNavigateResult<string>;
  params: Record<string, unknown>;
  routeKey: RouteKey;
  search: Record<string, unknown>;
  session: WebSessionDependency;
};

type AuthenticatedLayoutProps = {
  renderRegisteredPage?: (input: CapturedRegisteredPageInput) => ReactNode;
  session: WebSessionDependency;
  requiresMenuBootstrap?: boolean;
};

export function AuthenticatedLayout({
  renderRegisteredPage,
  session,
  requiresMenuBootstrap = true,
}: AuthenticatedLayoutProps): JSX.Element {
  const leafMatch = useRouterState({ select: (state) => state.matches.at(-1) });
  const activeRegisteredMatch =
    leafMatch?.status === "success" && leafMatch.staticData.routeKey !== undefined
      ? {
          fullPath: leafMatch.fullPath,
          params: leafMatch.params,
          registeredMenu: leafMatch.context.registeredMenu,
          registeredMenuAuthorization: leafMatch.context.registeredMenuAuthorization,
          routeKey: leafMatch.staticData.routeKey,
          search: leafMatch.search,
        }
      : null;
  const navigate = useNavigate({ from: activeRegisteredMatch?.fullPath });
  const authStatus = useStore(session.authStore, (state) => state.status);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? null,
  );
  const menuOrganizationId = useStore(session.menuStore, (state) => state.organizationId);
  const menuStatus = useStore(session.menuStore, (state) => state.status);
  const menuError = useStore(session.menuStore, (state) => state.error);
  const authorizedRoutes = useStore(session.menuStore, (state) => state.byRouteKey);

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
    isMenuReady && activeMenu && activeRegisteredMatch && renderRegisteredPage
      ? {
          authorizationSource: localMenu ? "local" : "resolved",
          keepAlive: activeMenu.keepAlive === true,
          menuId: activeMenu.id,
          params: activeRegisteredMatch.params,
          render: () =>
            renderRegisteredPage({
              navigate,
              params: activeRegisteredMatch.params,
              routeKey: activeRegisteredMatch.routeKey,
              search: activeRegisteredMatch.search,
              session,
            }),
        }
      : null;
  const cacheableMenuIds = new Set(
    Object.values(authorizedRoutes).flatMap((menu) => (menu?.keepAlive === true ? [menu.id] : [])),
  );
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
        <main id="main-content" className="min-h-0 flex-1">
          <PageCacheHost
            activePage={activePage}
            authorizationVersion={isMenuReady ? authorizedRoutes : null}
            cacheableMenuIds={cacheableMenuIds}
            fallback={fallback}
            scopeKey={organizationId}
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
