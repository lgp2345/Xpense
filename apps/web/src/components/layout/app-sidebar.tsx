import type { AuthorizedMenuNode } from "@xpense/shared";
import {
  LayoutDashboard,
  type LucideIcon,
  MonitorSmartphone,
  ScrollText,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
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
import type { NavigationGroup, NavigationItem } from "./navigation";
import { TeamSwitcher } from "./team-switcher";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  MonitorSmartphone,
  ScrollText,
  Shield,
  ShieldCheck,
  Users,
};

function resolveIcon(iconName: string | null): LucideIcon {
  if (iconName && ICON_MAP[iconName]) {
    return ICON_MAP[iconName];
  }
  return LayoutDashboard;
}

function menuToNavigationGroups(menus: AuthorizedMenuNode[]): NavigationGroup[] {
  const groups: NavigationGroup[] = [];

  for (const menu of menus) {
    if (menu.type === "directory" && menu.children.length > 0) {
      // 带子节点的目录 → NavigationGroup
      const items: NavigationItem[] = menu.children.flatMap((child) =>
        child.type === "menu" && !child.isExternal && child.path
          ? [
              {
                title: child.name,
                to: child.path as NavigationItem["to"],
                icon: resolveIcon(child.icon),
                permission: child.permissionCode,
              },
            ]
          : [],
      );

      if (items.length > 0) {
        groups.push({ title: menu.name, items });
      }
    } else if (menu.type === "menu" && !menu.isExternal && menu.path) {
      // 根菜单 → 单条 NavigationItem
      groups.push({
        title: menu.name,
        items: [
          {
            title: menu.name,
            to: menu.path as NavigationItem["to"],
            icon: resolveIcon(menu.icon),
            permission: menu.permissionCode,
          },
        ],
      });
    }
  }

  return groups;
}

export function AppSidebar({ session }: { session: WebSessionDependency }) {
  const menus = useStore(session.menuStore, (state) => state.tree);

  const navigationGroups = menuToNavigationGroups(menus);

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
