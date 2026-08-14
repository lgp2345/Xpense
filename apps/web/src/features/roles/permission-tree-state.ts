import type { PermissionKey, PermissionTreeNode } from "@xpense/shared";

export type PermissionNodeState = "unchecked" | "indeterminate" | "checked";

export function getPermissionNodeState(
  node: PermissionTreeNode,
  selectedPermissionKeys: readonly PermissionKey[],
): PermissionNodeState {
  const selected = new Set(selectedPermissionKeys);

  if (node.permissionCode !== null) {
    return selected.has(node.permissionCode) ? "checked" : "unchecked";
  }

  const descendantPermissionKeys = collectPermissionKeys(node);

  if (
    descendantPermissionKeys.length === 0 ||
    descendantPermissionKeys.every((permissionKey) => !selected.has(permissionKey))
  ) {
    return "unchecked";
  }

  return descendantPermissionKeys.every((permissionKey) => selected.has(permissionKey))
    ? "checked"
    : "indeterminate";
}

export function togglePermissionNode(
  tree: readonly PermissionTreeNode[],
  node: PermissionTreeNode,
  selectedPermissionKeys: readonly PermissionKey[],
  isSelected: boolean,
): PermissionKey[] {
  const next = new Set(selectedPermissionKeys);
  const path = findNodePath(tree, node);

  if (!isSelected) {
    for (const permissionKey of collectPermissionKeys(node)) {
      next.delete(permissionKey);
    }

    return [...next].toSorted();
  }

  const keysToSelect =
    node.type === "directory"
      ? collectPermissionKeys(node)
      : node.permissionCode === null
        ? []
        : [node.permissionCode];

  for (const permissionKey of keysToSelect) {
    next.add(permissionKey);
  }

  for (const ancestor of path.slice(0, -1)) {
    if (ancestor.permissionCode !== null) {
      next.add(ancestor.permissionCode);
    }
  }

  return [...next].toSorted();
}

export function collectTreePermissionKeys(tree: readonly PermissionTreeNode[]): PermissionKey[] {
  return tree.flatMap(collectPermissionKeys).toSorted();
}

function collectPermissionKeys(node: PermissionTreeNode): PermissionKey[] {
  return [
    ...(node.permissionCode === null ? [] : [node.permissionCode]),
    ...node.children.flatMap(collectPermissionKeys),
  ];
}

function findNodePath(
  nodes: readonly PermissionTreeNode[],
  target: PermissionTreeNode,
  ancestors: readonly PermissionTreeNode[] = [],
): PermissionTreeNode[] {
  for (const node of nodes) {
    const path = [...ancestors, node];

    if (isSameNode(node, target)) {
      return path;
    }

    const childPath = findNodePath(node.children, target, path);
    if (childPath.length > 0) {
      return childPath;
    }
  }

  return [];
}

function isSameNode(left: PermissionTreeNode, right: PermissionTreeNode): boolean {
  if (left === right) {
    return true;
  }

  if (left.id !== null || right.id !== null) {
    return left.id === right.id;
  }

  return left.type === right.type && left.name === right.name;
}
