import { menuIconKeys, permissionKeys, ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import type { MenuMutationDtoShape } from "./add-menu.dto.js";

const id = z.number().int().positive();
const name = z.string().trim().min(1).max(120);
const parentId = z.number().int().positive().nullable();
const icon = z.enum(menuIconKeys).nullable();
const permissionCode = z.enum(permissionKeys);
const routeKey = z.enum(Object.keys(ROUTE_DEFINITIONS) as [RouteKey, ...RouteKey[]]);

export const editMenuSchema = z
  .union([
    z
      .object({
        id,
        type: z.literal("directory"),
        name,
        parentId,
        icon,
        isVisible: z.boolean(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("menu"),
        name,
        parentId,
        routeKey,
        icon,
        permissionCode,
        isExternal: z.literal(false),
        isVisible: z.boolean(),
        keepAlive: z.boolean(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("menu"),
        name,
        parentId,
        url: z
          .string()
          .url()
          .refine((value) => /^https?:\/\//i.test(value)),
        icon,
        permissionCode,
        isExternal: z.literal(true),
        isVisible: z.boolean(),
      })
      .strict(),
    z
      .object({
        id,
        type: z.literal("button"),
        name,
        parentId: z.number().int().positive(),
        permissionCode,
      })
      .strict(),
  ])
  .transform((value): MenuMutationDtoShape & { id: number } => value);

export class EditMenuDto extends createZodDto(editMenuSchema) {}
