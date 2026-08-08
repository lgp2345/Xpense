import type { MenuItem } from "@xpense/shared";
import {
  LayoutDashboard,
  type LucideIcon,
  MonitorSmartphone,
  ScrollText,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
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

function menuToNavigationGroups(menus: MenuItem[]): NavigationGroup[] {
  const groups: NavigationGroup[] = [];

  for (const menu of menus) {
    if (menu.children.length > 0) {
      // 带子节点的目录 → NavigationGroup
      const items: NavigationItem[] = menu.children.map((child) => ({
        title: child.name,
        to: child.path as NavigationItem["to"],
        icon: resolveIcon(child.icon),
        permission: child.permissionCode as NavigationItem["permission"],
      }));

      if (items.length > 0) {
        groups.push({ title: menu.name, items });
      }
    } else if (menu.componentKey) {
      // 叶子节点（有 componentKey） → 单条 NavigationItem
      groups.push({
        title: menu.name,
        items: [
          {
            title: menu.name,
            to: menu.path as NavigationItem["to"],
            icon: resolveIcon(menu.icon),
            permission: menu.permissionCode as NavigationItem["permission"],
          },
        ],
      });
    }
  }

  return groups;
}

export function AppSidebar({ session }: { session: WebSessionDependency }) {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const status = useStore(session.authStore, (state) => state.status);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;
    session.iamApi
      .getMenus()
      .then((data) => {
        if (!cancelled) setMenus(data);
      })
      .catch(() => {
        // 菜单加载失败时静默降级：sidebar 显示为空
      });

    return () => {
      cancelled = true;
    };
  }, [session.iamApi, status]);

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
