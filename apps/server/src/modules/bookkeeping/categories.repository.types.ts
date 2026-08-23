import type { CategoryType } from "@xpense/shared";

import { categories } from "../../db/schema.js";
import type { CategoryTreeRecord } from "./categories.tree.js";

/** 分类持久化记录。 */
export type CategoryRecord = CategoryTreeRecord & {
  organizationId: string;
  createdByUserId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 创建分类的持久化输入。 */
export type CreateCategoryInput = {
  organizationId: string;
  ledgerId: string;
  type: CategoryType;
  parentId: string | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  createdByUserId: string;
};

/** 更新分类的完整可变字段快照。 */
export type UpdateCategoryInput = {
  id: string;
  organizationId: string;
  ledgerId: string;
  type: CategoryType;
  parentId: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
};

/** 同级分类名称冲突查询输入。 */
export type ActiveSiblingNameInput = {
  organizationId: string;
  ledgerId: string;
  type: CategoryType;
  parentId: string | null;
  name: string;
  excludeId?: string;
};

/** 软删除分类的持久化输入。 */
export type SoftDeleteCategoryInput = {
  organizationId: string;
  id: string;
  deletedByUserId: string;
};

/** 分类树查询的最小字段选择。 */
export const categoryTreeFields = {
  id: categories.id,
  ledgerId: categories.ledgerId,
  type: categories.type,
  parentId: categories.parentId,
  name: categories.name,
  icon: categories.icon,
  color: categories.color,
  sortOrder: categories.sortOrder,
};

/** 分类规则查询与写入返回的完整字段选择。 */
export const categoryRecordFields = {
  ...categoryTreeFields,
  organizationId: categories.organizationId,
  createdByUserId: categories.createdByUserId,
  deletedAt: categories.deletedAt,
  deletedByUserId: categories.deletedByUserId,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
};
