import {
  type CreateRentalTenantRequest,
  type RentalTenantDetail,
  type RentalTenantSummary,
  type RentalTenantType,
  rentalGenders,
  rentalIdentityDocumentTypes,
  rentalTenantTypes,
  type UpdateRentalTenantRequest,
} from "@xpense/shared";
import { z } from "zod";

const identityFields = [
  "documentCountryCode",
  "documentType",
  "documentTypeOtherName",
  "documentNumber",
  "birthDate",
  "gender",
  "ethnicity",
  "documentAddress",
] as const;

export const tenantFormSchema = z
  .object({
    type: z.enum(rentalTenantTypes),
    name: z.string().trim().min(1, "请输入租客名称").max(120, "租客名称不能超过 120 个字符"),
    phone: z
      .string()
      .trim()
      .max(40, "电话不能超过 40 个字符")
      .refine((value) => value === "" || /^[+()\d\s-]+$/.test(value), "请输入有效的电话号码"),
    email: z
      .string()
      .trim()
      .max(160, "邮箱不能超过 160 个字符")
      .refine(
        (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        "请输入有效的邮箱地址",
      ),
    primaryContactName: z.string().trim().max(120, "主要联系人不能超过 120 个字符"),
    documentCountryCode: z.string().trim().max(8, "证件国家代码不能超过 8 个字符"),
    documentType: z.union([z.enum(rentalIdentityDocumentTypes), z.literal("")]),
    documentTypeOtherName: z.string().trim().max(120, "自定义证件类型不能超过 120 个字符"),
    documentNumber: z.string().trim().max(120, "证件号码不能超过 120 个字符"),
    birthDate: z.string().trim(),
    gender: z.union([z.enum(rentalGenders), z.literal("")]),
    ethnicity: z.string().trim().max(80, "民族不能超过 80 个字符"),
    documentAddress: z.string().trim().max(500, "证件地址不能超过 500 个字符"),
    note: z.string().trim().max(2000, "备注不能超过 2000 个字符"),
  })
  .superRefine((value, context) => {
    if (
      value.type === "individual" &&
      value.documentType === "other" &&
      !value.documentTypeOtherName
    ) {
      context.addIssue({
        code: "custom",
        path: ["documentTypeOtherName"],
        message: "请输入自定义证件类型",
      });
    }
  });

export type TenantFormValues = z.infer<typeof tenantFormSchema>;

type TenantFormSource = Pick<
  RentalTenantSummary,
  | "type"
  | "name"
  | "phone"
  | "email"
  | "primaryContactName"
  | "documentCountryCode"
  | "documentType"
  | "documentTypeOtherName"
> &
  Partial<Pick<RentalTenantDetail, "note">>;

export function defaultTenantFormValues(
  tenant?: TenantFormSource | RentalTenantDetail,
): TenantFormValues {
  return {
    type: tenant?.type ?? "individual",
    name: tenant?.name ?? "",
    phone: tenant?.phone ?? "",
    email: tenant?.email ?? "",
    primaryContactName: tenant?.primaryContactName ?? "",
    documentCountryCode: tenant?.documentCountryCode ?? "",
    documentType: tenant?.documentType ?? "",
    documentTypeOtherName: tenant?.documentTypeOtherName ?? "",
    documentNumber: "",
    birthDate: "",
    gender: "",
    ethnicity: "",
    documentAddress: "",
    note: tenant && "note" in tenant ? (tenant.note ?? "") : "",
  };
}

export function clearTenantTypeSpecificValues(
  values: TenantFormValues,
  nextType: RentalTenantType = values.type,
): TenantFormValues {
  const next = { ...values, type: nextType };
  if (nextType === "company") {
    for (const field of identityFields) next[field] = "";
  } else if (next.documentType !== "other") {
    next.documentTypeOtherName = "";
  }
  return next;
}

export function toCreateTenantRequest(values: TenantFormValues): CreateRentalTenantRequest {
  const parsed = tenantFormSchema.parse(values);
  const request: CreateRentalTenantRequest = { type: parsed.type, name: parsed.name.trim() };
  appendCommonFields(request, parsed);
  if (parsed.type === "individual") appendIdentityFields(request, parsed);
  return request;
}

export function toUpdateTenantRequest(
  id: string,
  values: TenantFormValues,
  initialValues: TenantFormValues,
): UpdateRentalTenantRequest | null {
  const parsed = tenantFormSchema.parse(values);
  const initial = tenantFormSchema.parse(initialValues);
  const input: Partial<UpdateRentalTenantRequest> & Pick<UpdateRentalTenantRequest, "id"> = { id };
  if (parsed.type !== initial.type) input.type = parsed.type;
  addChanged(input, "name", parsed.name.trim(), initial.name.trim());
  addChanged(input, "phone", nullable(parsed.phone), nullable(initial.phone));
  addChanged(input, "email", nullable(parsed.email), nullable(initial.email));
  addChanged(
    input,
    "primaryContactName",
    nullable(parsed.primaryContactName),
    nullable(initial.primaryContactName),
  );
  if (parsed.type === "company") {
    if (initial.type === "individual") {
      for (const field of identityFields) {
        if (field === "documentNumber") input[field] = null;
        else input[field] = null;
      }
    }
  } else {
    addChanged(
      input,
      "documentCountryCode",
      nullable(parsed.documentCountryCode),
      nullable(initial.documentCountryCode),
    );
    addChanged(
      input,
      "documentType",
      nullable(parsed.documentType),
      nullable(initial.documentType),
    );
    addChanged(
      input,
      "documentTypeOtherName",
      nullable(parsed.documentTypeOtherName),
      nullable(initial.documentTypeOtherName),
    );
    if (parsed.documentNumber.trim()) input.documentNumber = parsed.documentNumber.trim();
    addChanged(input, "birthDate", nullable(parsed.birthDate), nullable(initial.birthDate));
    addChanged(input, "gender", nullable(parsed.gender), nullable(initial.gender));
    addChanged(input, "ethnicity", nullable(parsed.ethnicity), nullable(initial.ethnicity));
    addChanged(
      input,
      "documentAddress",
      nullable(parsed.documentAddress),
      nullable(initial.documentAddress),
    );
  }
  addChanged(input, "note", nullable(parsed.note), nullable(initial.note));
  return Object.keys(input).length > 1 ? (input as UpdateRentalTenantRequest) : null;
}

function appendCommonFields(request: CreateRentalTenantRequest, values: TenantFormValues): void {
  addOptional(request, "phone", values.phone);
  addOptional(request, "email", values.email);
  addOptional(request, "primaryContactName", values.primaryContactName);
  addOptional(request, "note", values.note);
}

function appendIdentityFields(request: CreateRentalTenantRequest, values: TenantFormValues): void {
  addOptional(request, "documentCountryCode", values.documentCountryCode);
  addOptional(request, "documentType", values.documentType);
  if (values.documentType === "other")
    addOptional(request, "documentTypeOtherName", values.documentTypeOtherName);
  addOptional(request, "documentNumber", values.documentNumber);
  addOptional(request, "birthDate", values.birthDate);
  addOptional(request, "gender", values.gender);
  addOptional(request, "ethnicity", values.ethnicity);
  addOptional(request, "documentAddress", values.documentAddress);
}

function addOptional<T extends object, K extends keyof T>(target: T, key: K, value: string): void {
  if (value.trim()) target[key] = value.trim() as T[K];
}

function addChanged(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  initial: unknown,
): void {
  if (value !== initial) target[key] = value;
}

function nullable(value: string): string | null {
  return value.trim() || null;
}
