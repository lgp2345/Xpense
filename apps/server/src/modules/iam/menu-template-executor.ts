import type { AppDbExecutor } from "../../db/db.module.js";
import { menus } from "../../db/schema.js";
import type { MenuTemplateExecutor } from "./menu-template.js";

/** 菜单模板复制只沿用调用方提供的事务，不自建连接或提交。 */
export function createMenuTemplateExecutor(executor: AppDbExecutor): MenuTemplateExecutor {
  return {
    async insertMenu(input) {
      const [menu] = await executor.insert(menus).values(input).returning({ id: menus.id });
      if (!menu) throw new Error("菜单模板初始化失败");
      return menu.id;
    },
  };
}
