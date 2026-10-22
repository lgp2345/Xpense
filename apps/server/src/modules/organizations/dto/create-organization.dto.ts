import { chinaPhoneSchema } from "@xpense/shared";
import { z } from "zod";

import { updateOrganizationProfileSchema } from "./update-organization-profile.dto.js";

const optionalEmail = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(z.email().nullable())
  .nullable()
  .optional();

const ownerSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("new"),
    phone: chinaPhoneSchema,
    email: optionalEmail,
    initialPassword: z.string().min(6).max(128).default("888888"),
  }),
  z.strictObject({
    kind: z.literal("existing"),
    phone: chinaPhoneSchema,
    userId: z.uuid(),
    confirmed: z.literal(true),
  }),
]);

/** 校验创建组织输入；同一手机号只能出现一次，关联账号须显式确认。 */
export const createOrganizationSchema = z.strictObject({
  ...updateOrganizationProfileSchema.shape,
  name: z.string().trim().min(1),
  baseCurrency: z.enum(["CNY", "USD"]),
  timezone: z
    .string()
    .trim()
    .refine((timeZone) => {
      try {
        new Intl.DateTimeFormat("en-CA", { timeZone });
        return true;
      } catch {
        return false;
      }
    }, "组织时区无效")
    .default("Asia/Shanghai"),
  owners: z
    .array(ownerSchema)
    .min(1)
    .superRefine((owners, ctx) => {
      const phones = new Set<string>();
      owners.forEach((owner, index) => {
        if (phones.has(owner.phone)) {
          ctx.addIssue({ code: "custom", path: [index, "phone"], message: "负责人手机号不能重复" });
        }
        phones.add(owner.phone);
      });
    }),
});

/** 经过创建校验、默认值填充和空值归一化的业务输入。 */
export type CreateOrganizationDto = z.output<typeof createOrganizationSchema>;
