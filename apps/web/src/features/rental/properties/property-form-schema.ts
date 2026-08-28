import {
  type CreateRentalPropertyRequest,
  type RentalPropertyDetail,
  type RentalPropertySummary,
  rentalPropertyTypes,
  type UpdateRentalPropertyRequest,
} from "@xpense/shared";
import { z } from "zod";

/** 房产表单保留字符串地址字段，提交时再收敛为空值或服务端请求。 */
export const propertyFormSchema = z
  .object({
    name: z.string().trim().min(1, "请输入房产名称").max(120, "房产名称不能超过 120 个字符"),
    type: z.enum(rentalPropertyTypes),
    customTypeName: z.string().trim().max(120, "自定义类型不能超过 120 个字符"),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "请输入两位国家代码"),
    province: z.string().trim().max(120, "省份不能超过 120 个字符"),
    city: z.string().trim().max(120, "城市不能超过 120 个字符"),
    district: z.string().trim().max(120, "区县不能超过 120 个字符"),
    addressLine: z.string().trim().min(1, "请输入详细地址").max(500, "详细地址不能超过 500 个字符"),
    note: z.string().trim().max(2000, "备注不能超过 2000 个字符"),
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
  initialValues: PropertyFormValues,
): UpdateRentalPropertyRequest | null {
  const input: Partial<UpdateRentalPropertyRequest> & Pick<UpdateRentalPropertyRequest, "id"> = {
    id,
  };
  const name = values.name.trim();
  const type = values.type;
  const customTypeName = values.customTypeName.trim();
  const countryCode = values.countryCode.trim().toUpperCase();
  const province = values.province.trim() || null;
  const city = values.city.trim() || null;
  const district = values.district.trim() || null;
  const addressLine = values.addressLine.trim();
  const note = values.note.trim() || null;
  if (name !== initialValues.name.trim()) input.name = name;
  if (type !== initialValues.type) input.type = type;
  if (type !== initialValues.type || customTypeName !== initialValues.customTypeName.trim()) {
    input.customTypeName = type === "other" ? customTypeName : null;
  }
  if (countryCode !== initialValues.countryCode.trim().toUpperCase())
    input.countryCode = countryCode;
  if (province !== (initialValues.province.trim() || null)) input.province = province;
  if (city !== (initialValues.city.trim() || null)) input.city = city;
  if (district !== (initialValues.district.trim() || null)) input.district = district;
  if (addressLine !== initialValues.addressLine.trim()) input.addressLine = addressLine;
  if (note !== (initialValues.note.trim() || null)) input.note = note;
  return Object.keys(input).length > 1 ? (input as UpdateRentalPropertyRequest) : null;
}

/** 从已有房产建立不丢失可空字段的编辑默认值。 */
export function propertyFormDefaults(
  property?: RentalPropertySummary | RentalPropertyDetail,
): PropertyFormValues {
  return {
    name: property?.name ?? "",
    type: property?.type ?? "residential_unit",
    customTypeName: property?.customTypeName ?? "",
    countryCode: property?.countryCode ?? "CN",
    province: property?.province ?? "",
    city: property?.city ?? "",
    district: property?.district ?? "",
    addressLine: property?.addressLine ?? "",
    note: property && "note" in property ? (property.note ?? "") : "",
  };
}
