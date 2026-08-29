import type {
  CreateRentalSpaceRequest,
  RentalSpaceNode,
  RentalSpaceType,
  UpdateRentalSpaceRequest,
} from "@xpense/shared";
import { rentalSpaceTypes } from "@xpense/shared";
import { z } from "zod";

/** 第一阶段空间资料；不包含面积、租金、押金、计费周期或占用状态。 */
export const spaceFormSchema = z
  .object({
    name: z.string().trim().min(1, "请输入空间名称").max(120, "空间名称不能超过 120 个字符"),
    code: z.string().trim().max(120, "空间编号不能超过 120 个字符"),
    type: z.enum(rentalSpaceTypes),
    customTypeName: z.string().trim().max(120, "自定义类型不能超过 120 个字符"),
    isRentable: z.boolean(),
    sortOrder: z.number().int("排序必须是整数").min(-2_147_483_648).max(2_147_483_647),
    note: z.string().trim().max(2000, "备注不能超过 2000 个字符"),
  })
  .superRefine((value, context) => {
    if (value.type === "other" && value.customTypeName.length === 0) {
      context.addIssue({ code: "custom", path: ["customTypeName"], message: "请输入自定义类型" });
    }
  });

export type SpaceFormValues = z.infer<typeof spaceFormSchema>;

export function spaceFormDefaults(space?: RentalSpaceNode): SpaceFormValues {
  return {
    name: space?.name ?? "",
    code: space?.code ?? "",
    type: space?.type ?? "room",
    customTypeName: space?.customTypeName ?? "",
    isRentable: space?.isRentable ?? true,
    sortOrder: space?.sortOrder ?? 0,
    note: space?.note ?? "",
  };
}

export function toCreateSpaceRequest(
  propertyId: string,
  parentId: string | undefined,
  values: SpaceFormValues,
): CreateRentalSpaceRequest {
  return {
    propertyId,
    ...(parentId ? { parentId } : {}),
    name: values.name.trim(),
    ...(values.code.trim() ? { code: values.code.trim() } : {}),
    type: values.type,
    ...(values.type === "other" ? { customTypeName: values.customTypeName.trim() } : {}),
    isRentable: values.isRentable,
    sortOrder: values.sortOrder,
    ...(values.note.trim() ? { note: values.note.trim() } : {}),
  };
}

export function toUpdateSpaceRequest(
  initialValues: SpaceFormValues,
  values: SpaceFormValues,
): Omit<UpdateRentalSpaceRequest, "id"> | null {
  const input: Partial<Omit<UpdateRentalSpaceRequest, "id">> = {};
  const name = values.name.trim();
  const code = values.code.trim() || null;
  const customTypeName = values.customTypeName.trim() || null;
  if (name !== initialValues.name.trim()) input.name = name;
  if (code !== (initialValues.code.trim() || null)) input.code = code;
  if (values.type !== initialValues.type) input.type = values.type;
  if (
    values.type !== initialValues.type ||
    customTypeName !== (initialValues.customTypeName.trim() || null)
  ) {
    input.customTypeName = values.type === "other" ? customTypeName : null;
  }
  if (values.isRentable !== initialValues.isRentable) input.isRentable = values.isRentable;
  if (values.sortOrder !== initialValues.sortOrder) input.sortOrder = values.sortOrder;
  const note = values.note.trim() || null;
  if (note !== (initialValues.note.trim() || null)) input.note = note;
  return Object.keys(input).length > 0 ? input : null;
}

export const spaceTypeOptions: readonly [RentalSpaceType, string][] = [
  ["building", "楼栋"],
  ["floor", "楼层"],
  ["unit", "单元"],
  ["room", "房间"],
  ["shop", "商铺"],
  ["office", "办公"],
  ["parking_space", "车位"],
  ["warehouse", "仓储"],
  ["other", "其他"],
];
