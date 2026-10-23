import { type CreateOrganizationInput, chinaPhoneSchema } from "@xpense/shared";
import { z } from "zod";
export type OwnerDraft = {
  id: string;
  phone: string;
  checkedPhone: string;
  candidate?:
    | { userId: string; phone: string | null; email: string | null; status: "active" | "disabled" }
    | null
    | undefined;
  confirmed: boolean;
  email: string;
  initialPassword: string;
  epoch: number;
};
export type OrganizationCreateValues = {
  name: string;
  baseCurrency: "CNY" | "USD";
  timezone: string;
  contactName: string;
  contactPhone: string;
  address: string;
  owners: OwnerDraft[];
};
const ownerSchema = z
  .object({
    id: z.string(),
    phone: chinaPhoneSchema,
    checkedPhone: z.string(),
    candidate: z
      .object({
        userId: z.uuid(),
        phone: z.string().nullable(),
        email: z.string().nullable(),
        status: z.enum(["active", "disabled"]),
      })
      .nullable()
      .optional(),
    confirmed: z.boolean(),
    email: z.string(),
    initialPassword: z.string(),
    epoch: z.number(),
  })
  .superRefine((owner, ctx) => {
    if (owner.checkedPhone !== owner.phone || owner.candidate === undefined)
      ctx.addIssue({ code: "custom", path: ["phone"], message: "请先检查此手机号的账号状态" });
    if (owner.candidate) {
      if (owner.candidate.status !== "active")
        ctx.addIssue({ code: "custom", path: ["confirmed"], message: "已停用账号不可关联" });
      else if (!owner.confirmed)
        ctx.addIssue({ code: "custom", path: ["confirmed"], message: "请确认关联已有账号" });
    } else if (owner.candidate === null) {
      if (owner.initialPassword.length < 6 || owner.initialPassword.length > 128)
        ctx.addIssue({
          code: "custom",
          path: ["initialPassword"],
          message: "初始密码须为6–128个字符",
        });
      if (owner.email.trim() && !z.email().safeParse(owner.email.trim()).success)
        ctx.addIssue({ code: "custom", path: ["email"], message: "请输入有效邮箱" });
    }
  });
export const organizationCreateSchema = z
  .object({
    name: z.string().trim().min(1, "请输入组织名称"),
    baseCurrency: z.enum(["CNY", "USD"]),
    timezone: z
      .string()
      .trim()
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "请输入有效的 IANA 时区"),
    contactName: z.string(),
    contactPhone: z.string(),
    address: z.string(),
    owners: z.array(ownerSchema).min(1, "请至少添加一位负责人"),
  })
  .superRefine((value, ctx) => {
    const phones = new Set<string>();
    value.owners.forEach((owner, index) => {
      if (phones.has(owner.phone))
        ctx.addIssue({
          code: "custom",
          path: ["owners", index, "phone"],
          message: "负责人手机号不能重复",
        });
      phones.add(owner.phone);
    });
  });
export function toOrganizationCreateInput(
  values: OrganizationCreateValues,
): CreateOrganizationInput {
  const parsed = organizationCreateSchema.parse(values);
  return {
    name: parsed.name,
    baseCurrency: parsed.baseCurrency,
    timezone: parsed.timezone,
    contactName: parsed.contactName.trim() || null,
    contactPhone: parsed.contactPhone.trim() || null,
    address: parsed.address.trim() || null,
    owners: parsed.owners.map((owner) =>
      owner.candidate
        ? {
            kind: "existing" as const,
            phone: owner.phone,
            userId: owner.candidate.userId,
            confirmed: true as const,
          }
        : {
            kind: "new" as const,
            phone: owner.phone,
            email: owner.email.trim() || null,
            initialPassword: owner.initialPassword,
          },
    ),
  };
}
export function newOwnerDraft(): OwnerDraft {
  return {
    id: crypto.randomUUID(),
    phone: "",
    checkedPhone: "",
    candidate: undefined,
    confirmed: false,
    email: "",
    initialPassword: "888888",
    epoch: 0,
  };
}
