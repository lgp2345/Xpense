import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type AuthorizedMenuNode,
  type MenuConfigurationNode,
  type MenuIconKey,
  type PermissionKey,
  ROUTE_DEFINITIONS,
  type RouteKey,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { MenuRepository } from "./menu.repository.js";
import {
  type AuthorizedMenuTreeNode,
  buildAuthorizedMenuTree,
  type MenuTreeNode,
} from "./menu-tree.js";

type ProjectedChildren = MenuConfigurationNode[] | AuthorizedMenuNode[];

@Injectable()
export class MenuService {
  constructor(private readonly repository: MenuRepository) {}

  async getAuthorizedMenus(authContext: AuthContext): Promise<AuthorizedMenuNode[]> {
    const rows = await this.repository.listByOrganizationId(authContext.organizationId);
    const permissionCodes = authContext.isSuperAdmin
      ? rows.flatMap((row) => (row.permissionCode === null ? [] : [row.permissionCode]))
      : authContext.permissions;
    const tree = buildAuthorizedMenuTree(rows, {
      organizationId: authContext.organizationId,
      permissionCodes,
    });

    return tree.flatMap((node) => projectAuthorizedNode(node));
  }

  async getConfiguration(authContext: AuthContext): Promise<MenuConfigurationNode[]> {
    const rows = await this.repository.listByOrganizationId(authContext.organizationId);

    return buildConfigurationTree(rows, authContext.organizationId);
  }

  async resolveRoute(authContext: AuthContext, path: string): Promise<AuthorizedMenuNode> {
    const rows = await this.repository.listByOrganizationId(authContext.organizationId);
    const node = rows.find(
      (candidate) =>
        candidate.organizationId === authContext.organizationId &&
        candidate.type === "menu" &&
        candidate.isExternal === false &&
        candidate.routeKey !== null &&
        matchesRoute(candidate.routeKey, path),
    );

    if (!node) {
      throw new NotFoundException("路由不存在");
    }

    if (
      !authContext.isSuperAdmin &&
      (node.permissionCode === null ||
        !authContext.permissions.includes(node.permissionCode as PermissionKey))
    ) {
      throw new ForbiddenException("无权访问该路由");
    }

    const projected = projectNode(node, []);

    if (!projected || projected.type === "button") {
      throw new NotFoundException("路由不存在");
    }

    return projected as AuthorizedMenuNode;
  }
}

function buildConfigurationTree(
  rows: readonly MenuTreeNode[],
  organizationId: string,
): MenuConfigurationNode[] {
  const organizationRows = rows.filter((row) => row.organizationId === organizationId);
  const childrenByParentId = new Map<number | null, MenuTreeNode[]>();

  for (const row of organizationRows) {
    const siblings = childrenByParentId.get(row.parentId) ?? [];
    siblings.push(row);
    childrenByParentId.set(row.parentId, siblings);
  }

  const build = (node: MenuTreeNode, ancestors: ReadonlySet<number>): MenuConfigurationNode[] => {
    if (ancestors.has(node.id)) {
      return [];
    }

    const nextAncestors = new Set(ancestors).add(node.id);
    const children = (childrenByParentId.get(node.id) ?? [])
      .sort(compareNodes)
      .flatMap((child) => build(child, nextAncestors));
    const projected = projectNode(node, children);

    return projected ? [projected] : [];
  };

  return (childrenByParentId.get(null) ?? [])
    .sort(compareNodes)
    .flatMap((root) => build(root, new Set()));
}

function projectAuthorizedNode(node: AuthorizedMenuTreeNode): AuthorizedMenuNode[] {
  const children = node.children.flatMap(projectAuthorizedNode);
  const projected = projectNode(node, children);

  return projected && projected.type !== "button" ? [projected as AuthorizedMenuNode] : [];
}

function projectNode(
  node: MenuTreeNode,
  children: ProjectedChildren,
): MenuConfigurationNode | null {
  const base = {
    id: node.id,
    parentId: node.parentId,
    name: node.name,
    sortOrder: node.sortOrder,
  };

  if (node.type === "directory") {
    return {
      ...base,
      type: "directory",
      icon: node.icon as MenuIconKey | null,
      isVisible: node.isVisible === true,
      routeKey: null,
      path: null,
      url: null,
      permissionCode: null,
      isExternal: null,
      keepAlive: null,
      children: children as MenuConfigurationNode[],
    };
  }

  if (node.type === "button") {
    if (node.permissionCode === null) {
      return null;
    }

    return {
      ...base,
      type: "button",
      icon: null,
      isVisible: null,
      routeKey: null,
      path: null,
      url: null,
      permissionCode: node.permissionCode as PermissionKey,
      isExternal: null,
      keepAlive: null,
      children: children as MenuConfigurationNode[],
    };
  }

  if (node.permissionCode === null) {
    return null;
  }

  if (node.isExternal === true) {
    if (node.path === null) {
      return null;
    }

    return {
      ...base,
      type: "menu",
      icon: node.icon as MenuIconKey | null,
      isVisible: node.isVisible === true,
      routeKey: null,
      path: null,
      url: node.path,
      permissionCode: node.permissionCode as PermissionKey,
      isExternal: true,
      keepAlive: null,
      children: children as MenuConfigurationNode[],
    };
  }

  const routeKey = getRouteKey(node.routeKey);

  if (!routeKey) {
    return null;
  }

  return {
    ...base,
    type: "menu",
    icon: node.icon as MenuIconKey | null,
    isVisible: node.isVisible === true,
    routeKey,
    path: ROUTE_DEFINITIONS[routeKey].path,
    url: null,
    permissionCode: node.permissionCode as PermissionKey,
    isExternal: false,
    keepAlive: node.keepAlive === true,
    children: children as MenuConfigurationNode[],
  } as MenuConfigurationNode;
}

function matchesRoute(routeKey: string, path: string): boolean {
  if (path.includes("?") || path.includes("#")) {
    return false;
  }

  const registeredRouteKey = getRouteKey(routeKey);

  if (!registeredRouteKey) {
    return false;
  }

  const pattern = ROUTE_DEFINITIONS[registeredRouteKey].path;
  const expression = compileRoutePattern(pattern);

  return expression?.test(path) ?? false;
}

function compileRoutePattern(pattern: string): RegExp | null {
  if (!pattern.startsWith("/") || pattern.includes("?") || pattern.includes("#")) {
    return null;
  }

  if (pattern === "/") {
    return /^\/$/;
  }

  const segments = pattern.slice(1).split("/");

  if (segments.some((segment) => segment.length === 0)) {
    return null;
  }

  const compiledSegments: string[] = [];

  for (const segment of segments) {
    if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
      compiledSegments.push("[^/]+");
      continue;
    }

    if (/[$*?:#{}]/.test(segment)) {
      return null;
    }

    compiledSegments.push(escapeRegExp(segment));
  }

  return new RegExp(`^/${compiledSegments.join("/")}$`);
}

function getRouteKey(value: string | null): RouteKey | null {
  return value !== null && Object.hasOwn(ROUTE_DEFINITIONS, value) ? (value as RouteKey) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareNodes(left: MenuTreeNode, right: MenuTreeNode): number {
  return left.sortOrder - right.sortOrder || left.id - right.id;
}
