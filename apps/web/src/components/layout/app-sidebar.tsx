import { Link, useMatches, useNavigate, useRouterState } from "@tanstack/react-router";
import type { RouteKey } from "@xpense/shared";
import { Building2, ChevronRight, RotateCcw } from "lucide-react";
import { type ComponentProps, useMemo } from "react";
import { useStore } from "zustand";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { WebSessionDependency } from "@/services/web-session";
import {
  buildNavigationGroups,
  findHighlightedMenuId,
  type MenuNavigationItem,
} from "./menu-navigation";
import { NavUser } from "./nav-user";
import { TeamSwitcher } from "./team-switcher";

export function AppSidebar({ session }: { session: WebSessionDependency }) {
  const navigate = useNavigate();
  const platformPath = useRouterState({ select: (state) => state.location.pathname });
  const platform = useStore(session.authStore, (state) => state.accessScope === "platform");
  const superAdmin = useStore(
    session.authStore,
    (state) => state.currentUser?.isSuperAdmin ?? false,
  );
  const menus = useStore(session.menuStore, (state) => state.tree);
  const { setOpenMobile } = useSidebar();
  const activeRouteKey = useMatches({
    select: (matches) => {
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const routeKey = matches[index]?.staticData.routeKey;

        if (routeKey) {
          return routeKey;
        }
      }

      return undefined;
    },
  }) as RouteKey | undefined;
  const navigationGroups = useMemo(() => buildNavigationGroups(menus), [menus]);
  const highlightedMenuId = useMemo(
    () => findHighlightedMenuId(menus, activeRouteKey),
    [activeRouteKey, menus],
  );

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <TeamSwitcher session={session} />
      </SidebarHeader>
      <SidebarContent>
        {platform
          ? null
          : navigationGroups.map((group) => (
              <SidebarGroup key={group.id}>
                <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.entries.map((entry) =>
                    entry.kind === "menu" ? (
                      <SidebarMenuItem key={entry.id}>
                        <SidebarMenuButton
                          isActive={highlightedMenuId === entry.id}
                          tooltip={entry.title}
                          render={
                            <NavigationAnchor
                              item={entry}
                              onNavigate={() => setOpenMobile(false)}
                            />
                          }
                        />
                      </SidebarMenuItem>
                    ) : (
                      <Collapsible
                        key={entry.id}
                        className="group/collapsible"
                        defaultOpen={entry.items.some((item) => item.id === highlightedMenuId)}
                        render={
                          <SidebarMenuItem>
                            <CollapsibleTrigger
                              render={
                                <SidebarMenuButton tooltip={entry.title}>
                                  <entry.icon />
                                  <span>{entry.title}</span>
                                  <ChevronRight className="ml-auto transition-transform group-data-open/collapsible:rotate-90" />
                                </SidebarMenuButton>
                              }
                            />
                            <CollapsibleContent>
                              <SidebarMenuSub>
                                {entry.items.map((item) => (
                                  <SidebarMenuSubItem key={item.id}>
                                    <SidebarMenuSubButton
                                      isActive={highlightedMenuId === item.id}
                                      render={
                                        <NavigationAnchor
                                          item={item}
                                          onNavigate={() => setOpenMobile(false)}
                                        />
                                      }
                                    />
                                  </SidebarMenuSubItem>
                                ))}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </SidebarMenuItem>
                        }
                      />
                    ),
                  )}
                </SidebarMenu>
              </SidebarGroup>
            ))}
        {superAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>平台管理</SidebarGroupLabel>
            <SidebarMenu>
              {[
                { href: "/platform/organizations", title: "组织管理", icon: Building2 },
                { href: "/system/menu-reset", title: "菜单恢复", icon: RotateCcw },
              ].map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={platformPath.startsWith(item.href)}
                    tooltip={item.title}
                    render={
                      <Link to={item.href} onClick={() => setOpenMobile(false)}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          session={session}
          onChangePassword={() => {
            setOpenMobile(false);
            void navigate({ to: "/account/password" });
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavigationAnchor({
  item,
  onNavigate,
  onClick,
  ...anchorProps
}: {
  item: MenuNavigationItem;
  onNavigate: () => void;
} & Omit<ComponentProps<"a">, "href">) {
  const handleClick: ComponentProps<"a">["onClick"] = (event) => {
    onClick?.(event);
    onNavigate();
  };

  if (item.isExternal) {
    return (
      <a
        {...anchorProps}
        href={item.href}
        rel={item.rel}
        target={item.target}
        onClick={handleClick}
      >
        <item.icon />
        <span>{item.title}</span>
      </a>
    );
  }

  return (
    <Link {...anchorProps} to={item.href} onClick={handleClick}>
      <item.icon />
      <span>{item.title}</span>
    </Link>
  );
}
