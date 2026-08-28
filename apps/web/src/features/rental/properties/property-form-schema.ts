import {
  type CreateRentalPropertyRequest,
  type RentalPropertyDetail,
  rentalPropertyTypes,
  type UpdateRentalPropertyRequest,
} from "@xpense/shared";
import { z } from "zod";

/** 房产表单保留字符串地址字段，提交时再收敛为空值或服务端请求。 */
export const propertyFormSchema = z
  .object({
    name: z.string().trim().min(1, "请输入房产名称").max(120, "房产名称不能超过 120 个字符"),
    type: z.enum(rentalPropertyTypes),
    customTypeName: z.string().trim().max(80, "自定义类型不能超过 80 个字符"),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "请输入两位国家代码"),
    province: z.string().trim().max(80, "省份不能超过 80 个字符"),
    city: z.string().trim().max(80, "城市不能超过 80 个字符"),
    district: z.string().trim().max(80, "区县不能超过 80 个字符"),
    addressLine: z.string().trim().min(1, "请输入详细地址").max(240, "详细地址不能超过 240 个字符"),
    note: z.string().trim().max(500, "备注不能超过 500 个字符"),
  })
  .superRefine((value, context) => {
    if (value.type === "other" && value.customTypeName.length === 0) {
      context.addIssue({ code: "custom", path: ["customTypeName"], message: "请输入自定义类型" });
    }
  });

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

/** 将新建表单值转换为不包含空字段的创建请求。 */
export function toCreatePropertyRequest(values: PropertyFormValues): CreateRentalPropertyRequest {
  return {
    name: values.name.trim(),
    type: values.type,
    countryCode: values.countryCode.trim().toUpperCase(),
    addressLine: values.addressLine.trim(),
    ...(values.type === "other" ? { customTypeName: values.customTypeName.trim() } : {}),
    ...(values.province.trim() ? { province: values.province.trim() } : {}),
    ...(values.city.trim() ? { city: values.city.trim() } : {}),
    ...(values.district.trim() ? { district: values.district.trim() } : {}),
    ...(values.note.trim() ? { note: values.note.trim() } : {}),
  };
}

/** 将编辑表单值转换为明确的可空更新字段。 */
export function toUpdatePropertyRequest(
  id: string,
  values: PropertyFormValues,
): UpdateRentalPropertyRequest {
  return {
    id,
    name: values.name.trim(),
    type: values.type,
    customTypeName: values.type === "other" ? values.customTypeName.trim() : null,
    countryCode: values.countryCode.trim().toUpperCase(),
    province: values.province.trim() || null,
    city: values.city.trim() || null,
    district: values.district.trim() || null,
    addressLine: values.addressLine.trim(),
    note: values.note.trim() || null,
  };
}

/** 从已有房产建立不丢失可空字段的编辑默认值。 */
export function propertyFormDefaults(property?: RentalPropertyDetail): PropertyFormValues {
  return {
    name: property?.name ?? "",
    type: property?.type ?? "residential_unit",
    customTypeName: property?.customTypeName ?? "",
    countryCode: property?.countryCode ?? "CN",
    province: property?.province ?? "",
    city: property?.city ?? "",
    district: property?.district ?? "",
    addressLine: property?.addressLine ?? "",
    note: property?.note ?? "",
  };
}
