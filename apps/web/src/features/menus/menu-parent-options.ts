import type { MenuConfigurationNode, MenuType } from "@xpense/shared";

export type MenuParentOption = {
  id: number;
  label: string;
};

export type MenuParentOptionsInput = {
  type: MenuType;
  editingNodeId?: number;
};

type IndexedNode = {
  node: MenuConfigurationNode;
  directoryDepth: number;
  label: string;
};

export function getMenuParentOptions(
  tree: readonly MenuConfigurationNode[],
  input: MenuParentOptionsInput,
): MenuParentOption[] {
  const excludedIds =
    input.editingNodeId === undefined
      ? new Set<number>()
      : getSubtreeIds(tree, input.editingNodeId);

  return indexMenuTree(tree)
    .filter(({ node, directoryDepth }) => {
      if (excludedIds.has(node.id)) {
        return false;
      }

      if (input.type === "directory") {
        return node.type === "directory" && directoryDepth === 1;
      }

      if (input.type === "menu") {
        return (
          (node.type === "directory" && directoryDepth <= 2) ||
          (node.type === "menu" && node.isExternal === false)
        );
      }

      return node.type === "menu" && node.isExternal === false;
    })
    .map(({ node, label }) => ({ id: node.id, label }));
}

function indexMenuTree(
  tree: readonly MenuConfigurationNode[],
  ancestorNames: readonly string[] = [],
  directoryDepth = 0,
): IndexedNode[] {
  const indexed: IndexedNode[] = [];

  for (const node of tree) {
    const names = [...ancestorNames, node.name];
    const nodeDirectoryDepth = directoryDepth + (node.type === "directory" ? 1 : 0);

    indexed.push({
      node,
      directoryDepth: nodeDirectoryDepth,
      label: names.join(" / "),
    });
    indexed.push(...indexMenuTree(node.children, names, nodeDirectoryDepth));
  }

  return indexed;
}

function getSubtreeIds(tree: readonly MenuConfigurationNode[], nodeId: number): Set<number> {
  const excludedIds = new Set<number>();

  function visit(nodes: readonly MenuConfigurationNode[], withinSubtree: boolean): void {
    for (const node of nodes) {
      const isExcluded = withinSubtree || node.id === nodeId;

      if (isExcluded) {
        excludedIds.add(node.id);
      }

      visit(node.children, isExcluded);
    }
  }

  visit(tree, false);
  return excludedIds;
}
