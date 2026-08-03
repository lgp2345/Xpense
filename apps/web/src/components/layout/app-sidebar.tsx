import { useStore } from "zustand";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { WebSessionDependency } from "@/services/web-session";
import { NavGroup } from "./nav-group";
import { NavUser } from "./nav-user";
import { getNavigationGroups } from "./navigation";
import { TeamSwitcher } from "./team-switcher";

export function AppSidebar({ session }: { session: WebSessionDependency }) {
  const permissions = useStore(session.authStore, (state) => state.permissions);
  const isSuperAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const navigationGroups = getNavigationGroups({ permissions, isSuperAdmin });
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <TeamSwitcher session={session} />
      </SidebarHeader>
      <SidebarContent>
        {navigationGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser session={session} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
