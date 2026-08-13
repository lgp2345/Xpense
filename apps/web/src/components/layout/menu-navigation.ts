import {
  type AuthorizedMenuNode,
  type MenuIconKey,
  ROUTE_DEFINITIONS,
  type RouteKey,
} from "@xpense/shared";
import {
  LayoutDashboard,
  type LucideIcon,
  MonitorSmartphone,
  ScrollText,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";

type InternalRoutePath = (typeof ROUTE_DEFINITIONS)[RouteKey]["path"];

type NavigationItemBase = {
  kind: "menu";
  id: number;
  title: string;
  icon: LucideIcon;
};

export type InternalNavigationItem = NavigationItemBase & {
  href: InternalRoutePath;
  isExternal: false;
  routeKey: RouteKey;
};

export type ExternalNavigationItem = NavigationItemBase & {
  href: string;
  isExternal: true;
  rel: "noopener noreferrer";
  routeKey: null;
  target: "_blank";
  windowFeatures: "noopener,noreferrer";
};

export type MenuNavigationItem = InternalNavigationItem | ExternalNavigationItem;

export type MenuNavigationGroup = {
  id: number;
  title: string;
  entries: MenuNavigationEntry[];
};

export type MenuNavigationDirectory = {
  kind: "directory";
  id: number;
  title: string;
  icon: LucideIcon;
  items: MenuNavigationItem[];
};

export type MenuNavigationEntry = MenuNavigationItem | MenuNavigationDirectory;

export type MenuCommandGroup = {
  id: number;
  title: string;
  items: MenuNavigationItem[];
};

type MenuProjection = {
  commandGroups: MenuCommandGroup[];
  navigationGroups: MenuNavigationGroup[];
  visibleMenuIdByRouteKey: Partial<Record<RouteKey, number>>;
};

type ProjectionGroup = {
  command: MenuCommandGroup;
  navigation: MenuNavigationGroup;
};

const ICONS: Record<MenuIconKey, LucideIcon> = {
  LayoutDashboard,
  MonitorSmartphone,
  ScrollText,
  Shield,
  ShieldCheck,
  Users,
};

const projectionCache = new WeakMap<readonly AuthorizedMenuNode[], MenuProjection>();

export function buildNavigationGroups(tree: readonly AuthorizedMenuNode[]): MenuNavigationGroup[] {
  return projectMenuTree(tree).navigationGroups;
}

export function buildCommandItems(tree: readonly AuthorizedMenuNode[]): MenuCommandGroup[] {
  return projectMenuTree(tree).commandGroups;
}

export function findHighlightedMenuId(
  tree: readonly AuthorizedMenuNode[],
  activeRouteKey: RouteKey | undefined,
): number | null {
  if (!activeRouteKey) {
    return null;
  }

  return projectMenuTree(tree).visibleMenuIdByRouteKey[activeRouteKey] ?? null;
}

function projectMenuTree(tree: readonly AuthorizedMenuNode[]): MenuProjection {
  const cached = projectionCache.get(tree);

  if (cached) {
    return cached;
  }

  const projection: MenuProjection = {
    commandGroups: [],
    navigationGroups: [],
    visibleMenuIdByRouteKey: {},
  };

  visitNodes(tree, null, null, null, true, projection);
  projectionCache.set(tree, projection);

  return projection;
}

function visitNodes(
  nodes: readonly AuthorizedMenuNode[],
  group: ProjectionGroup | null,
  directory: MenuNavigationDirectory | null,
  nearestVisibleMenuId: number | null,
  canAddNavigationItem: boolean,
  projection: MenuProjection,
): void {
  for (const node of nodes) {
    if (node.type === "directory") {
      visitDirectory(
        node,
        group,
        directory,
        nearestVisibleMenuId,
        canAddNavigationItem,
        projection,
      );
      continue;
    }

    visitMenu(node, group, directory, nearestVisibleMenuId, canAddNavigationItem, projection);
  }
}

function visitDirectory(
  node: Extract<AuthorizedMenuNode, { type: "directory" }>,
  parentGroup: ProjectionGroup | null,
  parentDirectory: MenuNavigationDirectory | null,
  nearestVisibleMenuId: number | null,
  canAddNavigationItem: boolean,
  projection: MenuProjection,
): void {
  if (!node.isVisible || !canAddNavigationItem) {
    visitNodes(
      node.children,
      parentGroup,
      parentDirectory,
      nearestVisibleMenuId,
      false,
      projection,
    );
    return;
  }

  if (parentGroup) {
    const directory = parentDirectory ?? createDirectory(node);

    if (!parentDirectory) {
      parentGroup.navigation.entries.push(directory);
    }

    visitNodes(node.children, parentGroup, directory, nearestVisibleMenuId, true, projection);

    if (!parentDirectory && directory.items.length === 0) {
      parentGroup.navigation.entries.pop();
    }
    return;
  }

  const group = createGroup(node.id, node.name);
  projection.navigationGroups.push(group.navigation);
  projection.commandGroups.push(group.command);
  visitNodes(node.children, group, null, nearestVisibleMenuId, true, projection);

  if (group.command.items.length === 0) {
    projection.navigationGroups.pop();
    projection.commandGroups.pop();
  }
}

function visitMenu(
  node: Extract<AuthorizedMenuNode, { type: "menu" }>,
  parentGroup: ProjectionGroup | null,
  parentDirectory: MenuNavigationDirectory | null,
  nearestVisibleMenuId: number | null,
  canAddNavigationItem: boolean,
  projection: MenuProjection,
): void {
  const isNavigable = node.isVisible && canAddNavigationItem;
  const item = isNavigable ? createNavigationItem(node) : null;
  let visibleMenuId = nearestVisibleMenuId;

  if (item) {
    const group = parentGroup ?? createGroup(node.id, node.name);

    if (parentDirectory) {
      parentDirectory.items.push(item);
    } else {
      group.navigation.entries.push(item);
    }
    group.command.items.push(item);
    visibleMenuId = node.id;

    if (!parentGroup) {
      projection.navigationGroups.push(group.navigation);
      projection.commandGroups.push(group.command);
    }
  }

  if (!node.isExternal) {
    const highlightedMenuId = isNavigable ? node.id : nearestVisibleMenuId;

    if (highlightedMenuId !== null) {
      projection.visibleMenuIdByRouteKey[node.routeKey] = highlightedMenuId;
    }
  }

  visitNodes(node.children, null, null, visibleMenuId, false, projection);
}

function createNavigationItem(
  node: Extract<AuthorizedMenuNode, { type: "menu" }>,
): MenuNavigationItem {
  const base = {
    kind: "menu" as const,
    id: node.id,
    title: node.name,
    icon: node.icon ? ICONS[node.icon] : LayoutDashboard,
  };

  if (node.isExternal) {
    return {
      ...base,
      href: node.url,
      isExternal: true,
      rel: "noopener noreferrer",
      routeKey: null,
      target: "_blank",
      windowFeatures: "noopener,noreferrer",
    };
  }

  return {
    ...base,
    href: ROUTE_DEFINITIONS[node.routeKey].path,
    isExternal: false,
    routeKey: node.routeKey,
  };
}

function createGroup(id: number, title: string): ProjectionGroup {
  return {
    command: { id, title, items: [] },
    navigation: { id, title, entries: [] },
  };
}

function createDirectory(
  node: Extract<AuthorizedMenuNode, { type: "directory" }>,
): MenuNavigationDirectory {
  return {
    kind: "directory",
    id: node.id,
    title: node.name,
    icon: node.icon ? ICONS[node.icon] : LayoutDashboard,
    items: [],
  };
}
