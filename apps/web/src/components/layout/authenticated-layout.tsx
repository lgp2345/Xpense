import { Outlet } from "@tanstack/react-router";
import type { JSX } from "react";
import { useStore } from "zustand";

import { CommandMenu } from "@/components/command-menu";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { WebSessionDependency } from "@/services/web-session";

import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";

type AuthenticatedLayoutProps = {
  session: WebSessionDependency;
  requiresMenuBootstrap?: boolean;
};

export function AuthenticatedLayout({
  session,
  requiresMenuBootstrap = true,
}: AuthenticatedLayoutProps): JSX.Element {
  const authStatus = useStore(session.authStore, (state) => state.status);
  const organizationId = useStore(
    session.authStore,
    (state) => state.currentOrganization?.id ?? null,
  );
  const menuOrganizationId = useStore(session.menuStore, (state) => state.organizationId);
  const menuStatus = useStore(session.menuStore, (state) => state.status);
  const menuError = useStore(session.menuStore, (state) => state.error);

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

  return (
    <SidebarProvider>
      <AppSidebar session={session} />
      <SidebarInset>
        <Header />
        <main id="main-content" className="min-h-0 flex-1">
          <Outlet />
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
