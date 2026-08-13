import {
  Outlet,
  type UseNavigateResult,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import type { AuthorizedMenuNode, RouteKey } from "@xpense/shared";
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
  search: unknown;
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
          registeredMenu: leafMatch.context.registeredMenu as AuthorizedMenuNode | undefined,
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

  if (requiresMenuBootstrap && menuOrganizationId === organizationId && menuStatus === "error") {
    return (
      <LayoutStatus>
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
      </LayoutStatus>
    );
  }

  if (requiresMenuBootstrap && (menuStatus !== "ready" || menuOrganizationId !== organizationId)) {
    return <LayoutStatus>正在加载组织菜单...</LayoutStatus>;
  }

  const activeMenu = activeRegisteredMatch
    ? (authorizedRoutes[activeRegisteredMatch.routeKey] ?? activeRegisteredMatch.registeredMenu)
    : undefined;
  const activePage: PageCacheHostPage | null =
    activeMenu && activeRegisteredMatch && renderRegisteredPage
      ? {
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

  return (
    <SidebarProvider>
      <AppSidebar session={session} />
      <SidebarInset>
        <Header />
        <main id="main-content" className="min-h-0 flex-1">
          <PageCacheHost
            activePage={activePage}
            cacheableMenuIds={cacheableMenuIds}
            fallback={<Outlet />}
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
