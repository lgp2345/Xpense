import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, isNull } from "drizzle-orm";

import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { menus } from "../../db/schema.js";

export type MenuRow = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  componentKey: string | null;
  icon: string | null;
  permissionCode: string | null;
  sortOrder: number;
};

@Injectable()
export class MenuRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async listAllMenus(): Promise<MenuRow[]> {
    return this.db
      .select({
        id: menus.id,
        name: menus.name,
        path: menus.path,
        parentId: menus.parentId,
        componentKey: menus.componentKey,
        icon: menus.icon,
        permissionCode: menus.permissionCode,
        sortOrder: menus.sortOrder,
      })
      .from(menus)
      .orderBy(asc(menus.sortOrder), asc(menus.name));
  }

  async listRootMenus(): Promise<MenuRow[]> {
    return this.db
      .select({
        id: menus.id,
        name: menus.name,
        path: menus.path,
        parentId: menus.parentId,
        componentKey: menus.componentKey,
        icon: menus.icon,
        permissionCode: menus.permissionCode,
        sortOrder: menus.sortOrder,
      })
      .from(menus)
      .where(isNull(menus.parentId))
      .orderBy(asc(menus.sortOrder), asc(menus.name));
  }

  async listChildMenus(parentId: string): Promise<MenuRow[]> {
    return this.db
      .select({
        id: menus.id,
        name: menus.name,
        path: menus.path,
        parentId: menus.parentId,
        componentKey: menus.componentKey,
        icon: menus.icon,
        permissionCode: menus.permissionCode,
        sortOrder: menus.sortOrder,
      })
      .from(menus)
      .where(eq(menus.parentId, parentId))
      .orderBy(asc(menus.sortOrder), asc(menus.name));
  }
}
