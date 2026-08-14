import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";

import type { AppDb, AppDbExecutor, AppDbTransaction } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { menus, organizations } from "../../db/schema.js";
import type { MenuTreeNode } from "./menu-tree.js";

export type MenuRow = MenuTreeNode;
export type MenuInsertInput = Omit<MenuRow, "id">;
export type MenuSortOrderUpdate = Pick<MenuRow, "id" | "sortOrder">;

const menuSelectFields = {
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
};

@Injectable()
export class MenuRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async listByOrganizationId(organizationId: string): Promise<MenuRow[]> {
    return this.db
      .select(menuSelectFields)
      .from(menus)
      .where(eq(menus.organizationId, organizationId))
      .orderBy(asc(menus.sortOrder), asc(menus.id));
  }

  runInTransaction<T>(operation: (transaction: AppDbTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(operation);
  }

  async lockOrganizationById(organizationId: string, executor: AppDbExecutor): Promise<boolean> {
    const [row] = await executor
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for("update")
      .limit(1);

    return row !== undefined;
  }

  async lockByOrganizationId(organizationId: string, executor: AppDbExecutor): Promise<MenuRow[]> {
    return executor
      .select(menuSelectFields)
      .from(menus)
      .where(eq(menus.organizationId, organizationId))
      .orderBy(asc(menus.sortOrder), asc(menus.id))
      .for("update");
  }

  async insertMenu(input: MenuInsertInput, executor: AppDbExecutor = this.db): Promise<MenuRow> {
    const [row] = await executor.insert(menus).values(input).returning(menuSelectFields);

    if (!row) {
      throw new Error("Inserted menu is unavailable");
    }

    return row;
  }

  async updateMenu(row: MenuRow, executor: AppDbExecutor = this.db): Promise<MenuRow> {
    const [updated] = await executor
      .update(menus)
      .set({
        type: row.type,
        name: row.name,
        parentId: row.parentId,
        routeKey: row.routeKey,
        path: row.path,
        icon: row.icon,
        permissionCode: row.permissionCode,
        isExternal: row.isExternal,
        isVisible: row.isVisible,
        keepAlive: row.keepAlive,
        sortOrder: row.sortOrder,
        updatedAt: new Date(),
      })
      .where(and(eq(menus.organizationId, row.organizationId), eq(menus.id, row.id)))
      .returning(menuSelectFields);

    if (!updated) {
      throw new Error("Updated menu is unavailable");
    }

    return updated;
  }

  async deleteMenu(
    organizationId: string,
    id: number,
    executor: AppDbExecutor = this.db,
  ): Promise<void> {
    await executor
      .delete(menus)
      .where(and(eq(menus.organizationId, organizationId), eq(menus.id, id)));
  }

  async setMenuSortOrders(
    organizationId: string,
    updates: readonly MenuSortOrderUpdate[],
    executor: AppDbExecutor = this.db,
  ): Promise<void> {
    for (const update of updates) {
      await executor
        .update(menus)
        .set({ sortOrder: update.sortOrder, updatedAt: new Date() })
        .where(and(eq(menus.organizationId, organizationId), eq(menus.id, update.id)));
    }
  }

  async deleteByOrganizationId(
    organizationId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<void> {
    await executor.delete(menus).where(eq(menus.organizationId, organizationId));
  }
}
