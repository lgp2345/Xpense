import {
  type MenuIconKey,
  menuIconKeys,
  type PermissionKey,
  permissionKeys,
  ROUTE_DEFINITIONS,
  type RouteKey,
} from "@xpense/shared";
import { z } from "zod";

const routeKeys = Object.keys(ROUTE_DEFINITIONS) as [RouteKey, ...RouteKey[]];
const nameSchema = z.string().trim().min(1, "请输入名称").max(120, "名称最多 120 个字符");
const parentIdSchema = z.number().int().positive().nullable();
const iconSchema = z.enum(menuIconKeys).nullable();
const permissionCodeSchema = z.enum(permissionKeys, { error: "请选择权限" });

export const directoryMenuFormSchema = z.strictObject({
  type: z.literal("directory"),
  name: nameSchema,
  parentId: parentIdSchema,
  icon: iconSchema,
  isVisible: z.boolean(),
});

export const internalMenuFormSchema = z.strictObject({
  type: z.literal("menu"),
  name: nameSchema,
  parentId: parentIdSchema,
  routeKey: z.enum(routeKeys, { error: "请选择注册路由" }),
  icon: iconSchema,
  permissionCode: permissionCodeSchema,
  isExternal: z.literal(false),
  isVisible: z.boolean(),
  keepAlive: z.boolean(),
});

export const externalMenuFormSchema = z.strictObject({
  type: z.literal("menu"),
  name: nameSchema,
  parentId: parentIdSchema,
  url: z
    .string()
    .trim()
    .min(1, "请输入外链 URL")
    .url("请输入有效的 URL")
    .refine((url) => /^https?:\/\//i.test(url), "外链只允许 HTTP 或 HTTPS URL"),
  icon: iconSchema,
  permissionCode: permissionCodeSchema,
  isExternal: z.literal(true),
  isVisible: z.boolean(),
});

export const buttonMenuFormSchema = z.strictObject({
  type: z.literal("button"),
  name: nameSchema,
  parentId: z.number().int().positive("请选择所属菜单"),
  permissionCode: permissionCodeSchema,
});

const menuModeFormSchema = z.discriminatedUnion("isExternal", [
  internalMenuFormSchema,
  externalMenuFormSchema,
]);

export const menuFormSchema = z.discriminatedUnion("type", [
  directoryMenuFormSchema,
  menuModeFormSchema,
  buttonMenuFormSchema,
]);

export type MenuFormValues = z.infer<typeof menuFormSchema>;

const draftRouteKeySchema = z.union([z.enum(routeKeys), z.literal("")]);
const draftPermissionCodeSchema = z.union([z.enum(permissionKeys), z.literal("")]);

export type MenuFormDraft = {
  type: "directory" | "menu" | "button";
  menuMode: "internal" | "external";
  name: string;
  parentId: number | null;
  routeKey: RouteKey | "";
  url: string;
  icon: MenuIconKey | null;
  permissionCode: PermissionKey | "";
  isVisible: boolean;
  keepAlive: boolean;
};

export const menuFormDraftSchema = z
  .object({
    type: z.enum(["directory", "menu", "button"]),
    menuMode: z.enum(["internal", "external"]),
    name: z.string(),
    parentId: parentIdSchema,
    routeKey: draftRouteKeySchema,
    url: z.string(),
    icon: iconSchema,
    permissionCode: draftPermissionCodeSchema,
    isVisible: z.boolean(),
    keepAlive: z.boolean(),
  })
  .transform((draft): MenuFormValues => toMenuFormCandidate(draft))
  .pipe(menuFormSchema);

export type MenuRouteOption = {
  key: RouteKey;
  label: string;
  path: string;
};

function toMenuFormCandidate(draft: MenuFormDraft): MenuFormValues {
  const common = {
    name: draft.name,
    parentId: draft.parentId,
  };

  if (draft.type === "directory") {
    return {
      ...common,
      type: "directory",
      icon: draft.icon,
      isVisible: draft.isVisible,
    };
  }

  if (draft.type === "button") {
    return {
      ...common,
      type: "button",
      parentId: draft.parentId as number,
      permissionCode: draft.permissionCode as PermissionKey,
    };
  }

  if (draft.menuMode === "external") {
    return {
      ...common,
      type: "menu",
      url: draft.url,
      icon: draft.icon,
      permissionCode: draft.permissionCode as PermissionKey,
      isExternal: true,
      isVisible: draft.isVisible,
    };
  }

  return {
    ...common,
    type: "menu",
    routeKey: draft.routeKey as RouteKey,
    icon: draft.icon,
    permissionCode: draft.permissionCode as PermissionKey,
    isExternal: false,
    isVisible: draft.isVisible,
    keepAlive: draft.keepAlive,
  };
}
