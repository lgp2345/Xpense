import { Link, useMatches } from "@tanstack/react-router";
import type { RouteKey } from "@xpense/shared";
import { ChevronRight } from "lucide-react";
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
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.entries.map((entry) =>
                entry.kind === "menu" ? (
                  <SidebarMenuItem key={entry.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={highlightedMenuId === entry.id}
                      tooltip={entry.title}
                    >
                      <NavigationAnchor item={entry} onNavigate={() => setOpenMobile(false)} />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  <Collapsible
                    key={entry.id}
                    asChild
                    className="group/collapsible"
                    defaultOpen={entry.items.some((item) => item.id === highlightedMenuId)}
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={entry.title}>
                          <entry.icon />
                          <span>{entry.title}</span>
                          <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {entry.items.map((item) => (
                            <SidebarMenuSubItem key={item.id}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={highlightedMenuId === item.id}
                              >
                                <NavigationAnchor
                                  item={item}
                                  onNavigate={() => setOpenMobile(false)}
                                />
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ),
              )}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser session={session} />
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
