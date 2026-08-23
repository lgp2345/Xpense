import type { CategoryNode } from "@xpense/shared";

import type { CategoryRecord, UpdateCategoryInput } from "./categories.repository.types.js";
import type { UpdateCategoryDto } from "./dto/update-category.dto.js";

const CATEGORY_NAME_UNIQUE_CONSTRAINTS = new Set([
  "categories_active_root_name_unique",
  "categories_active_child_name_unique",
]);

/** 合并分类更新字段为完整持久化快照。 */
export function mergeCategoryUpdate(
  current: CategoryRecord,
  dto: UpdateCategoryDto,
): UpdateCategoryInput {
  return {
    id: current.id,
    organizationId: current.organizationId,
    ledgerId: dto.ledgerId ?? current.ledgerId,
    type: dto.type ?? current.type,
    parentId: dto.parentId !== undefined ? dto.parentId : current.parentId,
    name: dto.name ?? current.name,
    icon: dto.icon !== undefined ? dto.icon : current.icon,
    color: dto.color !== undefined ? dto.color : current.color,
    sortOrder: dto.sortOrder ?? current.sortOrder,
  };
}

/** 判断有效子分类存在时，更新是否会破坏父分类的根级作用域。 */
export function changesActiveParentScope(
  current: CategoryRecord,
  next: UpdateCategoryInput,
): boolean {
  return next.parentId !== null || next.ledgerId !== current.ledgerId || next.type !== current.type;
}

/** 将持久化记录映射为无内部审计字段的分类树节点。 */
export function toCategoryNode(category: CategoryRecord): CategoryNode {
  return {
    id: category.id,
    ledgerId: category.ledgerId,
    type: category.type,
    parentId: category.parentId,
    name: category.name,
    icon: category.icon,
    color: category.color,
    sortOrder: category.sortOrder,
    children: [],
  };
}

/** 识别分类活动同级名称唯一约束，包括驱动包装的 cause 链。 */
export function isCategoryNameUniqueViolation(
  error: unknown,
  visited = new Set<object>(),
): boolean {
  if (error === null || typeof error !== "object" || visited.has(error)) return false;
  visited.add(error);
  const constraint =
    ("constraint" in error && error.constraint) ||
    ("constraint_name" in error && error.constraint_name);
  if (
    "code" in error &&
    error.code === "23505" &&
    typeof constraint === "string" &&
    CATEGORY_NAME_UNIQUE_CONSTRAINTS.has(constraint)
  ) {
    return true;
  }

  return "cause" in error && isCategoryNameUniqueViolation(error.cause, visited);
}
