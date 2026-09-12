import {
  type MenuIconKey,
  type MenuType,
  menuIconKeys,
  type PermissionKey,
  permissionKeys,
  ROUTE_DEFINITIONS,
  type RouteKey,
} from "@xpense/shared";
import { z } from "zod";

const menuNameSchema = z.string().trim().min(1).max(120);
const parentIdSchema = z.number().int().positive().nullable();
const iconSchema = z.enum(menuIconKeys).nullable();
const permissionCodeSchema = z.enum(permissionKeys);
const routeKeySchema = z.enum(Object.keys(ROUTE_DEFINITIONS) as [RouteKey, ...RouteKey[]]);

export const addDirectoryMenuSchema = z
  .object({
    type: z.literal("directory"),
    name: menuNameSchema,
    parentId: parentIdSchema,
    icon: iconSchema.default(null),
    isVisible: z.boolean().default(true),
  })
  .strict();

export const addInternalMenuSchema = z
  .object({
    type: z.literal("menu"),
    name: menuNameSchema,
    parentId: parentIdSchema,
    routeKey: routeKeySchema,
    icon: iconSchema.default(null),
    permissionCode: permissionCodeSchema,
    isExternal: z.literal(false).default(false),
    isVisible: z.boolean().default(true),
    keepAlive: z.boolean().default(false),
  })
  .strict();

export const addExternalMenuSchema = z
  .object({
    type: z.literal("menu"),
    name: menuNameSchema,
    parentId: parentIdSchema,
    url: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//i.test(value), {
        message: "外链只允许 HTTP 或 HTTPS URL",
      }),
    icon: iconSchema.default(null),
    permissionCode: permissionCodeSchema,
    isExternal: z.literal(true),
    isVisible: z.boolean().default(true),
  })
  .strict();

export const addButtonMenuSchema = z
  .object({
    type: z.literal("button"),
    name: menuNameSchema,
    parentId: z.number().int().positive(),
    permissionCode: permissionCodeSchema,
  })
  .strict();

const addMenuNodeSchema = z.union([
  addDirectoryMenuSchema,
  addExternalMenuSchema,
  addInternalMenuSchema,
  addButtonMenuSchema,
]);

export type MenuMutationDtoShape = {
  type: MenuType;
  name: string;
  parentId: number | null;
  routeKey?: RouteKey;
  url?: string;
  icon?: MenuIconKey | null;
  permissionCode?: PermissionKey;
  isExternal?: boolean;
  isVisible?: boolean;
  keepAlive?: boolean;
};

export const addMenuSchema = addMenuNodeSchema.transform((value): MenuMutationDtoShape => value);

/** 经过 addMenuSchema 校验并转换后的业务输入。 */
export type AddMenuDto = z.output<typeof addMenuSchema>;
