import { z } from "zod";

import type {
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../../../services/bookkeeping-api";

const iconPattern = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;

/** 分类表单校验规则。 */
export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "请输入分类名称").max(120, "分类名称不能超过 120 个字符"),
  parentId: z.string(),
  icon: z
    .string()
    .trim()
    .refine((value) => value === "" || iconPattern.test(value), "图标格式不正确"),
  color: z
    .string()
    .trim()
    .refine((value) => value === "" || colorPattern.test(value), "颜色格式不正确"),
  sortOrder: z
    .string()
    .trim()
    .refine(
      (value) =>
        /^-?\d+$/.test(value) && Number(value) >= -2_147_483_648 && Number(value) <= 2_147_483_647,
      "排序值必须是有效整数",
    ),
});

/** 分类表单值。 */
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

/** 将表单转换为创建分类请求。 */
export function toCreateCategoryRequest(
  values: CategoryFormValues,
  context: Pick<CreateCategoryRequest, "ledgerId" | "type">,
): CreateCategoryRequest {
  return {
    ...context,
    parentId: values.parentId === "none" ? null : values.parentId,
    name: values.name.trim(),
    icon: values.icon.trim() || undefined,
    color: values.color.trim() || undefined,
    sortOrder: Number(values.sortOrder),
  };
}

/** 将表单转换为更新分类请求。 */
export function toUpdateCategoryRequest(values: CategoryFormValues): UpdateCategoryRequest {
  return {
    parentId: values.parentId === "none" ? null : values.parentId,
    name: values.name.trim(),
    icon: values.icon.trim() || null,
    color: values.color.trim() || null,
    sortOrder: Number(values.sortOrder),
  };
}
