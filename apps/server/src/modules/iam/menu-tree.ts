import type { MenuType } from "@xpense/shared";

export type MenuTreeNode = {
  id: number;
  organizationId: string;
  type: MenuType;
  name: string;
  parentId: number | null;
  routeKey: string | null;
  path: string | null;
  icon: string | null;
  permissionCode: string | null;
  isExternal: boolean | null;
  isVisible: boolean | null;
  keepAlive: boolean | null;
  sortOrder: number;
};

export type AuthorizedMenuTreeNode = MenuTreeNode & {
  children: AuthorizedMenuTreeNode[];
};

export type MenuTreeRuleCode =
  | "button_has_children"
  | "button_parent_must_be_menu"
  | "cross_organization_parent"
  | "cycle_detected"
  | "directory_depth_exceeded"
  | "directory_parent_must_be_directory"
  | "external_not_leaf"
  | "menu_parent_must_be_directory"
  | "non_leaf_delete"
  | "parameter_route_visible"
  | "parent_not_found";

export type MenuTreeValidationResult =
  | { ok: true }
  | { ok: false; code: MenuTreeRuleCode; nodeId: number };

export type ValidateMenuTreeOptions = {
  deletingId?: number;
};

export type AllowedParentIdsOptions = {
  organizationId: string;
  type: MenuType;
};

export type BuildAuthorizedMenuTreeOptions = {
  organizationId: string;
  permissionCodes: readonly string[];
};

type MenuTreeIndexes = {
  byId: Map<number, MenuTreeNode>;
  childrenByParentId: Map<number, MenuTreeNode[]>;
};

const parameterRouteSegment = /(^|\/)\$[A-Za-z][A-Za-z0-9_]*\??(?=\/|$)/;

export function validateMenuTree(
  nodes: readonly MenuTreeNode[],
  options: ValidateMenuTreeOptions = {},
): MenuTreeValidationResult {
  const indexes = buildIndexes(nodes);

  for (const node of nodes) {
    const parent = node.parentId === null ? undefined : indexes.byId.get(node.parentId);

    if (node.parentId !== null && !parent) {
      return failure("parent_not_found", node.id);
    }

    if (parent && parent.organizationId !== node.organizationId) {
      return failure("cross_organization_parent", node.id);
    }

    if (hasCycle(node, indexes.byId)) {
      return failure("cycle_detected", node.id);
    }

    const children = indexes.childrenByParentId.get(node.id) ?? [];

    if (node.type === "button" && children.length > 0) {
      return failure("button_has_children", node.id);
    }

    if (node.type === "menu" && node.isExternal === true && children.length > 0) {
      return failure("external_not_leaf", node.id);
    }

    if (node.type === "directory") {
      if (parent && parent.type !== "directory") {
        return failure("directory_parent_must_be_directory", node.id);
      }

      if (getDirectoryDepth(node, indexes.byId) > 2) {
        return failure("directory_depth_exceeded", node.id);
      }
    }

    if (
      node.type === "menu" &&
      parent &&
      parent.type !== "directory" &&
      (parent.type !== "menu" || parent.isExternal !== false)
    ) {
      return failure("menu_parent_must_be_directory", node.id);
    }

    if (node.type === "button" && parent?.type !== "menu") {
      return failure("button_parent_must_be_menu", node.id);
    }

    if (node.type === "menu" && node.isVisible === true && hasParameterRoute(node.path)) {
      return failure("parameter_route_visible", node.id);
    }
  }

  if (
    options.deletingId !== undefined &&
    (indexes.childrenByParentId.get(options.deletingId)?.length ?? 0) > 0
  ) {
    return failure("non_leaf_delete", options.deletingId);
  }

  return { ok: true };
}

export function getAllowedParentIds(
  nodes: readonly MenuTreeNode[],
  options: AllowedParentIdsOptions,
): number[] {
  const indexes = buildIndexes(nodes);
  const organizationNodes = nodes.filter((node) => node.organizationId === options.organizationId);

  return organizationNodes
    .filter((node) => {
      if (options.type === "directory") {
        return node.type === "directory" && getDirectoryDepth(node, indexes.byId) === 1;
      }

      if (options.type === "menu") {
        return (
          (node.type === "directory" && getDirectoryDepth(node, indexes.byId) <= 2) ||
          (node.type === "menu" && node.isExternal === false)
        );
      }

      return node.type === "menu" && node.isExternal !== true;
    })
    .map((node) => node.id);
}

export function isNavigationEligible(node: MenuTreeNode, nodes?: readonly MenuTreeNode[]): boolean {
  if (!hasNavigationFields(node)) {
    return false;
  }

  return nodes === undefined || hasVisibleDirectoryAncestors(node, buildIndexes(nodes).byId);
}

export function findNavigationAncestor(
  nodes: readonly MenuTreeNode[],
  nodeId: number,
): MenuTreeNode | null {
  const { byId } = buildIndexes(nodes);
  const visited = new Set<number>();
  let current = byId.get(nodeId);

  while (current && !visited.has(current.id)) {
    if (isNavigationEligibleWithIndexes(current, byId)) {
      return current;
    }

    visited.add(current.id);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  return null;
}

export function buildAuthorizedMenuTree(
  nodes: readonly MenuTreeNode[],
  options: BuildAuthorizedMenuTreeOptions,
): AuthorizedMenuTreeNode[] {
  const indexes = buildIndexes(nodes);
  const permissionCodes = new Set(options.permissionCodes);
  const organizationNodes = nodes.filter((node) => node.organizationId === options.organizationId);
  const includedIds = new Set<number>();

  for (const node of organizationNodes) {
    if (
      !isNavigationEligibleWithIndexes(node, indexes.byId) ||
      node.permissionCode === null ||
      !permissionCodes.has(node.permissionCode)
    ) {
      continue;
    }

    if (includeDirectoryAncestors(node, indexes.byId, options.organizationId, includedIds)) {
      includedIds.add(node.id);
    }
  }

  const buildNode = (node: MenuTreeNode): AuthorizedMenuTreeNode => ({
    ...node,
    children: (indexes.childrenByParentId.get(node.id) ?? [])
      .filter((child) => includedIds.has(child.id))
      .sort(compareNodes)
      .map(buildNode),
  });

  return organizationNodes
    .filter(
      (node) =>
        includedIds.has(node.id) && (node.parentId === null || !includedIds.has(node.parentId)),
    )
    .sort(compareNodes)
    .map(buildNode);
}

function buildIndexes(nodes: readonly MenuTreeNode[]): MenuTreeIndexes {
  const byId = new Map<number, MenuTreeNode>();
  const childrenByParentId = new Map<number, MenuTreeNode[]>();

  for (const node of nodes) {
    byId.set(node.id, node);

    if (node.parentId !== null) {
      const children = childrenByParentId.get(node.parentId) ?? [];

      children.push(node);
      childrenByParentId.set(node.parentId, children);
    }
  }

  return { byId, childrenByParentId };
}

function failure(code: MenuTreeRuleCode, nodeId: number): MenuTreeValidationResult {
  return { ok: false, code, nodeId };
}

function hasCycle(node: MenuTreeNode, byId: ReadonlyMap<number, MenuTreeNode>): boolean {
  const visited = new Set<number>([node.id]);
  let parentId = node.parentId;

  while (parentId !== null) {
    if (visited.has(parentId)) {
      return true;
    }

    visited.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }

  return false;
}

function getDirectoryDepth(node: MenuTreeNode, byId: ReadonlyMap<number, MenuTreeNode>): number {
  let depth = node.type === "directory" ? 1 : 0;
  let parentId = node.parentId;
  const visited = new Set<number>([node.id]);

  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);

    if (!parent) {
      break;
    }

    if (parent.type === "directory") {
      depth += 1;
    }

    parentId = parent.parentId;
  }

  return depth;
}

function includeDirectoryAncestors(
  node: MenuTreeNode,
  byId: ReadonlyMap<number, MenuTreeNode>,
  organizationId: string,
  includedIds: Set<number>,
): boolean {
  let parentId = node.parentId;
  const ancestors: MenuTreeNode[] = [];
  const visited = new Set<number>();

  while (parentId !== null) {
    const parent = byId.get(parentId);

    if (
      !parent ||
      visited.has(parent.id) ||
      parent.organizationId !== organizationId ||
      parent.type !== "directory" ||
      parent.isVisible !== true
    ) {
      return false;
    }

    visited.add(parent.id);
    ancestors.push(parent);
    parentId = parent.parentId;
  }

  for (const ancestor of ancestors) {
    includedIds.add(ancestor.id);
  }

  return true;
}

function hasParameterRoute(path: string | null): boolean {
  return path !== null && parameterRouteSegment.test(path);
}

function isNavigationEligibleWithIndexes(
  node: MenuTreeNode,
  byId: ReadonlyMap<number, MenuTreeNode>,
): boolean {
  return hasNavigationFields(node) && hasVisibleDirectoryAncestors(node, byId);
}

function hasNavigationFields(node: MenuTreeNode): boolean {
  return node.type === "menu" && node.isVisible === true && !hasParameterRoute(node.path);
}

function hasVisibleDirectoryAncestors(
  node: MenuTreeNode,
  byId: ReadonlyMap<number, MenuTreeNode>,
): boolean {
  let parentId = node.parentId;
  const visited = new Set<number>();

  while (parentId !== null) {
    const parent = byId.get(parentId);

    if (
      !parent ||
      visited.has(parent.id) ||
      parent.type !== "directory" ||
      parent.isVisible !== true
    ) {
      return false;
    }

    visited.add(parent.id);
    parentId = parent.parentId;
  }

  return true;
}

function compareNodes(left: MenuTreeNode, right: MenuTreeNode): number {
  return left.sortOrder - right.sortOrder || left.id - right.id;
}
