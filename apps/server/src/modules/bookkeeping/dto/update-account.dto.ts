import { accountTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 更新账户请求校验规则。 */
export const updateAccountSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    type: z.enum(accountTypes).optional(),
    icon: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/, "图标必须是有效的图标标识")
      .nullable()
      .optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是六位十六进制色值")
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.type !== undefined ||
      value.icon !== undefined ||
      value.color !== undefined ||
      value.sortOrder !== undefined,
    { message: "至少需要提供一项账户信息" },
  );

/** 更新账户请求 DTO。 */
export class UpdateAccountDto extends createZodDto(updateAccountSchema) {}
