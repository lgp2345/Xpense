import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { menus } from "../../db/schema.js";
import type { MenuTreeNode } from "./menu-tree.js";

export type MenuRow = MenuTreeNode;

@Injectable()
export class MenuRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async listByOrganizationId(organizationId: string): Promise<MenuRow[]> {
    return this.db
      .select({
        id: menus.id,
        organizationId: menus.organizationId,
        type: menus.type,
        name: menus.name,
        parentId: menus.parentId,
        routeKey: menus.routeKey,
        path: menus.path,
        icon: menus.icon,
        permissionCode: menus.permissionCode,
        isExternal: menus.isExternal,
        isVisible: menus.isVisible,
        keepAlive: menus.keepAlive,
        sortOrder: menus.sortOrder,
      })
      .from(menus)
      .where(eq(menus.organizationId, organizationId))
      .orderBy(asc(menus.sortOrder), asc(menus.id));
  }
}
