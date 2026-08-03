import { Outlet } from "@tanstack/react-router";
import type { JSX } from "react";

import { CommandMenu } from "@/components/command-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { WebSessionDependency } from "@/services/web-session";

import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";

export function AuthenticatedLayout({ session }: { session: WebSessionDependency }): JSX.Element {
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
