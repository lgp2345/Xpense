import type { MenuConfigurationNode } from "@xpense/shared";

export type MenuSearch = {
  name?: string;
  destination?: string;
  permission?: string;
};

/** 仅标记命中节点及祖先，保留原始树供排序、删除和可见性计算使用。 */
export function getMatchingMenuIds(
  nodes: readonly MenuConfigurationNode[],
  search: MenuSearch,
): ReadonlySet<number> | null {
  const name = search.name?.trim().toLowerCase() ?? "";
  const destination = search.destination?.trim().toLowerCase() ?? "";
  const permission = search.permission?.trim().toLowerCase() ?? "";
  if (!name && !destination && !permission) {
    return null;
  }
  const matches = new Set<number>();
  function visit(node: MenuConfigurationNode): boolean {
    let hasMatchingChild = false;
    for (const child of node.children) {
      if (visit(child)) hasMatchingChild = true;
    }
    const matchesSelf =
      node.name.toLowerCase().includes(name) &&
      (!destination ||
        [node.path, node.routeKey, node.url].some((value) =>
          value?.toLowerCase().includes(destination),
        )) &&
      (!permission || (node.permissionCode?.toLowerCase().includes(permission) ?? false));
    if (!matchesSelf && !hasMatchingChild) return false;
    matches.add(node.id);
    return true;
  }
  for (const node of nodes) visit(node);
  return matches;
}
