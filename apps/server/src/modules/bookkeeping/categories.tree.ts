import type { CategoryNode } from "@xpense/shared";

/** 构造分类树所需的最小持久化记录。 */
export type CategoryTreeRecord = Omit<CategoryNode, "children">;

/** 按 sortOrder、name 和 id 提供确定性的分类同级排序。 */
function compareCategoryNodes(left: CategoryNode, right: CategoryNode): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * 将已限定组织和账本作用域的扁平分类记录投影为两级树。
 * @param records 当前账本的未删除分类记录。
 * @returns 只包含根节点和直属子节点的有序分类树。
 */
export function buildCategoryTree(records: readonly CategoryTreeRecord[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(
    records.map((record) => [record.id, { ...record, children: [] }]),
  );
  const roots: CategoryNode[] = [];

  for (const node of nodes.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }

    nodes.get(node.parentId)?.children.push(node);
  }

  for (const root of roots) {
    root.children.sort(compareCategoryNodes);
  }

  return roots.sort(compareCategoryNodes);
}
