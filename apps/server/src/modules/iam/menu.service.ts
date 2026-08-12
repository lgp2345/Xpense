import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type AuthorizedMenuNode,
  type MenuConfigurationNode,
  type MenuIconKey,
  type PermissionKey,
  ROUTE_DEFINITIONS,
  type RouteKey,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { AuditService } from "../audit/audit.service.js";
import type { AddMenuDto } from "./dto/add-menu.dto.js";
import type { DeleteMenuDto } from "./dto/delete-menu.dto.js";
import type { EditMenuDto } from "./dto/edit-menu.dto.js";
import type { EditMenuOrderDto } from "./dto/edit-menu-order.dto.js";
import type { ResetOrganizationMenusDto } from "./dto/reset-organization-menus.dto.js";
import { type MenuInsertInput, MenuRepository, type MenuRow } from "./menu.repository.js";
import { copyMenuTemplate, DEFAULT_MENU_TEMPLATE } from "./menu-template.js";
import {
  type AuthorizedMenuTreeNode,
  buildAuthorizedMenuTree,
  type MenuTreeNode,
  validateMenuTree,
} from "./menu-tree.js";

type ProjectedChildren = MenuConfigurationNode[] | AuthorizedMenuNode[];

@Injectable()
export class MenuService {
  constructor(
    private readonly repository: MenuRepository,
    private readonly auditService: AuditService,
  ) {}

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

  async addMenu(authContext: AuthContext, dto: AddMenuDto): Promise<MenuRow> {
    return this.repository.runInTransaction(async (transaction) => {
      const rows = await this.repository.lockByOrganizationId(
        authContext.organizationId,
        transaction,
      );
      const input = buildMenuInput(
        authContext.organizationId,
        dto,
        getNextSortOrder(rows, dto.parentId),
      );

      assertNoDuplicateRouteOrUrl(rows, input);
      const proposedNode = {
        id: Math.max(0, ...rows.map((row) => row.id)) + 1,
        ...input,
      };
      assertValidTree([...rows, proposedNode]);
      assertParameterRouteVisibility([...rows, proposedNode], proposedNode);

      const created = await this.repository.insertMenu(input, transaction);

      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "menu.created",
          targetType: "menu",
          targetId: String(created.id),
          result: "succeeded",
          metadata: {
            type: created.type,
            parentId: created.parentId,
          },
        },
        transaction,
      );

      return created;
    });
  }

  async editMenu(authContext: AuthContext, dto: EditMenuDto): Promise<MenuRow> {
    return this.repository.runInTransaction(async (transaction) => {
      const rows = await this.repository.lockByOrganizationId(
        authContext.organizationId,
        transaction,
      );
      const current = rows.find((row) => row.id === dto.id);

      if (!current) {
        throw new NotFoundException("菜单不存在");
      }

      const sortOrder =
        current.parentId === dto.parentId
          ? current.sortOrder
          : getNextSortOrder(rows, dto.parentId);
      const input = buildMenuInput(authContext.organizationId, dto, sortOrder);
      const proposed = { id: dto.id, ...input };

      assertNoDuplicateRouteOrUrl(rows, input, dto.id);
      const proposedRows = rows.map((row) => (row.id === dto.id ? proposed : row));
      assertValidTree(proposedRows);
      assertParameterRouteVisibility(proposedRows, proposed);

      const updated = await this.repository.updateMenu(proposed, transaction);

      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "menu.updated",
          targetType: "menu",
          targetId: String(updated.id),
          result: "succeeded",
          metadata: {
            type: updated.type,
            parentIdFrom: current.parentId,
            parentIdTo: updated.parentId,
          },
        },
        transaction,
      );

      return updated;
    });
  }

  async deleteMenu(authContext: AuthContext, dto: DeleteMenuDto): Promise<void> {
    await this.repository.runInTransaction(async (transaction) => {
      const rows = await this.repository.lockByOrganizationId(
        authContext.organizationId,
        transaction,
      );
      const current = rows.find((row) => row.id === dto.id);

      if (!current) {
        throw new NotFoundException("菜单不存在");
      }

      const validation = validateMenuTree(rows, { deletingId: dto.id });

      if (!validation.ok) {
        throw new ConflictException(`菜单不能删除：${validation.code}`);
      }

      await this.repository.deleteMenu(authContext.organizationId, dto.id, transaction);
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "menu.deleted",
          targetType: "menu",
          targetId: String(current.id),
          result: "succeeded",
          metadata: {
            type: current.type,
            parentId: current.parentId,
          },
        },
        transaction,
      );
    });
  }

  async editMenuOrder(authContext: AuthContext, dto: EditMenuOrderDto): Promise<void> {
    await this.repository.runInTransaction(async (transaction) => {
      const rows = await this.repository.lockByOrganizationId(
        authContext.organizationId,
        transaction,
      );
      const current = rows.find((row) => row.id === dto.id);

      if (!current) {
        throw new NotFoundException("菜单不存在");
      }

      const siblings = rows.filter((row) => row.parentId === current.parentId).sort(compareNodes);
      const currentIndex = siblings.findIndex((row) => row.id === current.id);
      const siblingIndex = dto.direction === "up" ? currentIndex - 1 : currentIndex + 1;
      const sibling = siblings[siblingIndex];

      if (!sibling) {
        throw new ConflictException("菜单已经位于同级排序边界");
      }

      await this.repository.setMenuSortOrders(
        authContext.organizationId,
        [
          { id: current.id, sortOrder: sibling.sortOrder },
          { id: sibling.id, sortOrder: current.sortOrder },
        ],
        transaction,
      );
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "menu.moved",
          targetType: "menu",
          targetId: String(current.id),
          result: "succeeded",
          metadata: {
            parentId: current.parentId,
            direction: dto.direction,
            siblingId: sibling.id,
          },
        },
        transaction,
      );
    });
  }

  async resetOrganizationMenus(
    authContext: AuthContext,
    dto: ResetOrganizationMenusDto,
  ): Promise<void> {
    if (!authContext.isSuperAdmin) {
      throw new ForbiddenException("只有超级管理员可以重置组织菜单");
    }

    await this.repository.runInTransaction(async (transaction) => {
      const previousRows = await this.repository.lockByOrganizationId(
        dto.organizationId,
        transaction,
      );

      await this.repository.deleteByOrganizationId(dto.organizationId, transaction);
      await copyMenuTemplate(dto.organizationId, {
        insertMenu: async (input) => (await this.repository.insertMenu(input, transaction)).id,
      });
      await this.auditService.appendRequired(
        {
          organizationId: dto.organizationId,
          actorUserId: authContext.userId,
          action: "menu.tree_reset",
          targetType: "organization",
          targetId: dto.organizationId,
          result: "succeeded",
          metadata: {
            replacedNodeCount: previousRows.length,
            templateNodeCount: DEFAULT_MENU_TEMPLATE.length,
          },
        },
        transaction,
      );
    });
  }
}

function buildMenuInput(
  organizationId: string,
  dto: AddMenuDto | EditMenuDto,
  sortOrder: number,
): MenuInsertInput {
  const base = {
    organizationId,
    name: dto.name,
    parentId: dto.parentId,
    sortOrder,
  };

  if (dto.type === "directory") {
    return {
      ...base,
      type: "directory",
      routeKey: null,
      path: null,
      icon: dto.icon ?? null,
      permissionCode: null,
      isExternal: null,
      isVisible: requireBoolean(dto.isVisible, "目录显隐状态必填"),
      keepAlive: null,
    };
  }

  if (dto.type === "button") {
    return {
      ...base,
      type: "button",
      routeKey: null,
      path: null,
      icon: null,
      permissionCode: requirePermissionCode(dto.permissionCode),
      isExternal: null,
      isVisible: null,
      keepAlive: null,
    };
  }

  if (dto.isExternal === true) {
    const url = requireString(dto.url, "外链 URL 必填");

    assertExternalUrl(url);

    return {
      ...base,
      type: "menu",
      routeKey: null,
      path: url,
      icon: dto.icon ?? null,
      permissionCode: requirePermissionCode(dto.permissionCode),
      isExternal: true,
      isVisible: requireBoolean(dto.isVisible, "菜单显隐状态必填"),
      keepAlive: null,
    };
  }

  if (dto.isExternal !== false) {
    throw new BadRequestException("菜单必须明确区分内部路由或外链");
  }

  const routeKey = getRouteKey(dto.routeKey ?? null);

  if (!routeKey) {
    throw new BadRequestException("内部菜单路由不存在");
  }

  return {
    ...base,
    type: "menu",
    routeKey,
    path: null,
    icon: dto.icon ?? null,
    permissionCode: requirePermissionCode(dto.permissionCode),
    isExternal: false,
    isVisible: requireBoolean(dto.isVisible, "菜单显隐状态必填"),
    keepAlive: requireBoolean(dto.keepAlive, "内部菜单保活状态必填"),
  };
}

function getNextSortOrder(rows: readonly MenuTreeNode[], parentId: number | null): number {
  return (
    Math.max(-1, ...rows.filter((row) => row.parentId === parentId).map((row) => row.sortOrder)) + 1
  );
}

function assertNoDuplicateRouteOrUrl(
  rows: readonly MenuTreeNode[],
  proposed: MenuInsertInput,
  editingId?: number,
): void {
  const duplicate = rows.some(
    (row) =>
      row.id !== editingId &&
      ((proposed.routeKey !== null && row.routeKey === proposed.routeKey) ||
        (proposed.path !== null && row.path === proposed.path)),
  );

  if (duplicate) {
    throw new ConflictException("组织内的路由或外链已存在");
  }
}

function assertValidTree(rows: readonly MenuTreeNode[]): void {
  const result = validateMenuTree(rows);

  if (!result.ok) {
    throw new ConflictException(`菜单树结构无效：${result.code}`);
  }
}

function assertParameterRouteVisibility(rows: readonly MenuTreeNode[], node: MenuTreeNode): void {
  if (
    node.type !== "menu" ||
    node.isExternal === true ||
    node.routeKey === null ||
    !isActuallyVisible(rows, node)
  ) {
    return;
  }

  const routeKey = getRouteKey(node.routeKey);

  if (routeKey && /(^|\/)\$[A-Za-z_][A-Za-z0-9_]*(\/|$)/.test(ROUTE_DEFINITIONS[routeKey].path)) {
    throw new BadRequestException("实际可见菜单不能使用参数路由");
  }
}

function isActuallyVisible(rows: readonly MenuTreeNode[], node: MenuTreeNode): boolean {
  if (node.isVisible !== true) {
    return false;
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const visited = new Set<number>([node.id]);
  let parentId = node.parentId;

  while (parentId !== null) {
    const parent = byId.get(parentId);

    if (!parent || visited.has(parent.id) || parent.isVisible === false) {
      return false;
    }

    visited.add(parent.id);
    parentId = parent.parentId;
  }

  return true;
}

function assertExternalUrl(value: string): void {
  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return;
    }
  } catch {
    // Handled by the stable HTTP exception below.
  }

  throw new BadRequestException("外链只允许 HTTP 或 HTTPS URL");
}

function requireString(value: string | undefined, message: string): string {
  if (value === undefined || value.length === 0) {
    throw new BadRequestException(message);
  }

  return value;
}

function requireBoolean(value: boolean | undefined, message: string): boolean {
  if (value === undefined) {
    throw new BadRequestException(message);
  }

  return value;
}

function requirePermissionCode(value: PermissionKey | undefined): PermissionKey {
  if (value === undefined) {
    throw new BadRequestException("权限码必填");
  }

  return value;
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
