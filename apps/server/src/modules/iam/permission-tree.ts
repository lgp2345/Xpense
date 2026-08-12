import type { PermissionKey, PermissionTreeNode } from "@xpense/shared";

import type { MenuRow } from "./menu.repository.js";

export type PermissionTreeCatalogItem = {
  key: PermissionKey;
  name: string;
};

export type PermissionNodeState = "unchecked" | "indeterminate" | "checked";

const otherPermissionsName = "其他权限";

export function buildPermissionTree(
  rows: readonly MenuRow[],
  permissions: readonly PermissionTreeCatalogItem[],
): PermissionTreeNode[] {
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission]));
  const representatives = pickRepresentatives(
    rows.filter(
      (row): row is MenuRow & { permissionCode: PermissionKey } =>
        row.permissionCode !== null && permissionByKey.has(row.permissionCode as PermissionKey),
    ),
  );
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const includedIds = new Set([...representatives.values()].map((row) => row.id));

  for (const representative of representatives.values()) {
    includeDirectoryAncestors(representative, rowById, includedIds);
  }

  const includedRows = rows.filter((row) => includedIds.has(row.id));
  const effectiveParentById = new Map<number, number | null>();

  for (const row of includedRows) {
    effectiveParentById.set(row.id, findIncludedParentId(row, rowById, includedIds));
  }

  const childrenByParentId = new Map<number | null, MenuRow[]>();

  for (const row of includedRows) {
    const parentId = effectiveParentById.get(row.id) ?? null;
    const children = childrenByParentId.get(parentId) ?? [];
    children.push(row);
    childrenByParentId.set(parentId, children);
  }

  const buildNode = (row: MenuRow): PermissionTreeNode => {
    const children = (childrenByParentId.get(row.id) ?? []).sort(compareMenuRows).map(buildNode);

    if (row.type === "directory") {
      return {
        id: row.id,
        parentId: effectiveParentById.get(row.id) ?? null,
        type: "directory",
        name: row.name,
        permissionCode: null,
        children,
      };
    }

    const permissionCode = row.permissionCode as PermissionKey;

    return {
      id: row.id,
      parentId: effectiveParentById.get(row.id) ?? null,
      type: row.type,
      name: row.name,
      permissionCode,
      children,
    };
  };

  const tree = (childrenByParentId.get(null) ?? []).sort(compareMenuRows).map(buildNode);
  const mappedCodes = new Set(representatives.keys());
  const unmapped = permissions
    .filter((permission) => !mappedCodes.has(permission.key))
    .toSorted((left, right) => comparePermissionCodes(left.key, right.key));

  if (unmapped.length > 0) {
    tree.push({
      id: null,
      parentId: null,
      type: "directory",
      name: otherPermissionsName,
      permissionCode: null,
      children: unmapped.map((permission, index) => ({
        id: -(index + 1),
        parentId: null,
        type: "menu",
        name: permission.name,
        permissionCode: permission.key,
        children: [],
      })),
    });
  }

  return tree;
}

export function getPermissionNodeState(
  node: PermissionTreeNode,
  selectedPermissionCodes: readonly PermissionKey[],
): PermissionNodeState {
  const selected = new Set(selectedPermissionCodes);
  const permissionCodes = collectPermissionCodes(node);

  if (permissionCodes.length === 0 || permissionCodes.every((code) => !selected.has(code))) {
    return "unchecked";
  }

  return permissionCodes.every((code) => selected.has(code)) ? "checked" : "indeterminate";
}

export function completePermissionSelection(
  rows: readonly MenuRow[],
  selectedPermissionCodes: readonly PermissionKey[],
): PermissionKey[] {
  const completed = new Set(selectedPermissionCodes);
  const representatives = pickRepresentatives(
    rows.filter(
      (row): row is MenuRow & { permissionCode: PermissionKey } => row.permissionCode !== null,
    ),
  );
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const pending = [...completed];

  while (pending.length > 0) {
    const permissionCode = pending.pop();
    const representative = permissionCode ? representatives.get(permissionCode) : undefined;

    if (!representative) {
      continue;
    }

    for (const ancestorCode of collectAncestorPermissionCodes(representative, rowById)) {
      if (!completed.has(ancestorCode)) {
        completed.add(ancestorCode);
        pending.push(ancestorCode);
      }
    }
  }

  return [...completed].toSorted();
}

export function findMissingAncestorPermissions(
  rows: readonly MenuRow[],
  selectedPermissionCodes: readonly PermissionKey[],
): PermissionKey[] {
  const selected = new Set(selectedPermissionCodes);

  return completePermissionSelection(rows, selectedPermissionCodes).filter(
    (permissionCode) => !selected.has(permissionCode),
  );
}

function pickRepresentatives<T extends MenuRow & { permissionCode: PermissionKey }>(
  rows: readonly T[],
): Map<PermissionKey, T> {
  const representatives = new Map<PermissionKey, T>();

  for (const row of rows) {
    const current = representatives.get(row.permissionCode);

    if (!current || compareRepresentatives(row, current) < 0) {
      representatives.set(row.permissionCode, row);
    }
  }

  return representatives;
}

function compareRepresentatives(left: MenuRow, right: MenuRow): number {
  return (
    getRepresentativePriority(left) - getRepresentativePriority(right) ||
    left.sortOrder - right.sortOrder ||
    left.id - right.id
  );
}

function getRepresentativePriority(row: MenuRow): number {
  if (row.type === "menu" && row.isVisible === true) {
    return 0;
  }

  if (row.type === "button") {
    return 1;
  }

  return 2;
}

function includeDirectoryAncestors(
  row: MenuRow,
  rowById: ReadonlyMap<number, MenuRow>,
  includedIds: Set<number>,
): void {
  const visited = new Set<number>([row.id]);
  let parentId = row.parentId;

  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = rowById.get(parentId);

    if (!parent) {
      return;
    }

    if (parent.type === "directory") {
      includedIds.add(parent.id);
    }

    parentId = parent.parentId;
  }
}

function findIncludedParentId(
  row: MenuRow,
  rowById: ReadonlyMap<number, MenuRow>,
  includedIds: ReadonlySet<number>,
): number | null {
  const visited = new Set<number>([row.id]);
  let parentId = row.parentId;

  while (parentId !== null && !visited.has(parentId)) {
    if (includedIds.has(parentId)) {
      return parentId;
    }

    visited.add(parentId);
    parentId = rowById.get(parentId)?.parentId ?? null;
  }

  return null;
}

function collectPermissionCodes(node: PermissionTreeNode): PermissionKey[] {
  return [
    ...(node.permissionCode === null ? [] : [node.permissionCode]),
    ...node.children.flatMap(collectPermissionCodes),
  ];
}

function collectAncestorPermissionCodes(
  row: MenuRow,
  rowById: ReadonlyMap<number, MenuRow>,
): PermissionKey[] {
  const result: PermissionKey[] = [];
  const visited = new Set<number>([row.id]);
  let parentId = row.parentId;

  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = rowById.get(parentId);

    if (!parent) {
      break;
    }

    if (parent.permissionCode !== null) {
      result.push(parent.permissionCode as PermissionKey);
    }

    parentId = parent.parentId;
  }

  return result;
}

function compareMenuRows(left: MenuRow, right: MenuRow): number {
  return left.sortOrder - right.sortOrder || left.id - right.id;
}

function comparePermissionCodes(left: PermissionKey, right: PermissionKey): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
