import type { MenuIconKey, MenuType, PermissionKey, RouteKey } from "@xpense/shared";

import { BOOKKEEPING_MENU_TEMPLATE } from "./bookkeeping-menu-template.js";

export type MenuTemplateNode = {
  templateKey: string;
  parentTemplateKey: string | null;
  type: MenuType;
  name: string;
  routeKey: RouteKey | null;
  icon: MenuIconKey | null;
  permissionCode: PermissionKey | null;
  isExternal: boolean | null;
  isVisible: boolean | null;
  keepAlive: boolean | null;
  sortOrder: number;
};

export type MenuTemplateInsert = Omit<MenuTemplateNode, "templateKey" | "parentTemplateKey"> & {
  organizationId: string;
  parentId: number | null;
  path: null;
};

export type MenuTemplateExecutor = {
  insertMenu(input: MenuTemplateInsert): Promise<number>;
};

export const DEFAULT_MENU_TEMPLATE: readonly MenuTemplateNode[] = [
  {
    templateKey: "dashboard",
    parentTemplateKey: null,
    type: "menu",
    name: "仪表盘",
    routeKey: "Dashboard",
    icon: "LayoutDashboard",
    permissionCode: "dashboard:read",
    isExternal: false,
    isVisible: true,
    keepAlive: true,
    sortOrder: 0,
  },
  ...BOOKKEEPING_MENU_TEMPLATE,
  {
    templateKey: "access-control",
    parentTemplateKey: null,
    type: "directory",
    name: "访问控制",
    routeKey: null,
    icon: "ShieldCheck",
    permissionCode: null,
    isExternal: null,
    isVisible: true,
    keepAlive: null,
    sortOrder: 10,
  },
  {
    templateKey: "members",
    parentTemplateKey: "access-control",
    type: "menu",
    name: "成员管理",
    routeKey: "Members",
    icon: "Users",
    permissionCode: "members:read",
    isExternal: false,
    isVisible: true,
    keepAlive: true,
    sortOrder: 0,
  },
  {
    templateKey: "members.create",
    parentTemplateKey: "members",
    type: "button",
    name: "新增成员",
    routeKey: null,
    icon: null,
    permissionCode: "members:create",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 100,
  },
  {
    templateKey: "members.update",
    parentTemplateKey: "members",
    type: "button",
    name: "编辑成员",
    routeKey: null,
    icon: null,
    permissionCode: "members:update",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 110,
  },
  {
    templateKey: "members.disable",
    parentTemplateKey: "members",
    type: "button",
    name: "停用成员",
    routeKey: null,
    icon: null,
    permissionCode: "members:disable",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 120,
  },
  {
    templateKey: "members.enable",
    parentTemplateKey: "members",
    type: "button",
    name: "启用成员",
    routeKey: null,
    icon: null,
    permissionCode: "members:enable",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 130,
  },
  {
    templateKey: "roles",
    parentTemplateKey: "access-control",
    type: "menu",
    name: "角色管理",
    routeKey: "Roles",
    icon: "ShieldCheck",
    permissionCode: "roles:read",
    isExternal: false,
    isVisible: true,
    keepAlive: true,
    sortOrder: 10,
  },
  {
    templateKey: "roles.create",
    parentTemplateKey: "roles",
    type: "button",
    name: "新增角色",
    routeKey: null,
    icon: null,
    permissionCode: "roles:create",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 100,
  },
  {
    templateKey: "roles.update",
    parentTemplateKey: "roles",
    type: "button",
    name: "编辑角色",
    routeKey: null,
    icon: null,
    permissionCode: "roles:update",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 110,
  },
  {
    templateKey: "roles.delete",
    parentTemplateKey: "roles",
    type: "button",
    name: "删除角色",
    routeKey: null,
    icon: null,
    permissionCode: "roles:delete",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 120,
  },
  {
    templateKey: "roles.permissions.update",
    parentTemplateKey: "roles",
    type: "button",
    name: "配置角色权限",
    routeKey: null,
    icon: null,
    permissionCode: "roles:permissions:update",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 130,
  },
  {
    templateKey: "menus",
    parentTemplateKey: "access-control",
    type: "menu",
    name: "菜单管理",
    routeKey: "Menus",
    icon: "ShieldCheck",
    permissionCode: "menus:read",
    isExternal: false,
    isVisible: true,
    keepAlive: true,
    sortOrder: 20,
  },
  {
    templateKey: "menus.create",
    parentTemplateKey: "menus",
    type: "button",
    name: "新增菜单",
    routeKey: null,
    icon: null,
    permissionCode: "menus:create",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 100,
  },
  {
    templateKey: "menus.update",
    parentTemplateKey: "menus",
    type: "button",
    name: "编辑菜单",
    routeKey: null,
    icon: null,
    permissionCode: "menus:update",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 110,
  },
  {
    templateKey: "menus.delete",
    parentTemplateKey: "menus",
    type: "button",
    name: "删除菜单",
    routeKey: null,
    icon: null,
    permissionCode: "menus:delete",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 120,
  },
  {
    templateKey: "security",
    parentTemplateKey: null,
    type: "directory",
    name: "安全",
    routeKey: null,
    icon: "Shield",
    permissionCode: null,
    isExternal: null,
    isVisible: true,
    keepAlive: null,
    sortOrder: 20,
  },
  {
    templateKey: "sessions",
    parentTemplateKey: "security",
    type: "menu",
    name: "会话管理",
    routeKey: "Sessions",
    icon: "MonitorSmartphone",
    permissionCode: "sessions:read",
    isExternal: false,
    isVisible: true,
    keepAlive: true,
    sortOrder: 0,
  },
  {
    templateKey: "sessions.revoke",
    parentTemplateKey: "sessions",
    type: "button",
    name: "注销会话",
    routeKey: null,
    icon: null,
    permissionCode: "sessions:revoke",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 100,
  },
  {
    templateKey: "audit-logs",
    parentTemplateKey: "security",
    type: "menu",
    name: "审计日志",
    routeKey: "AuditLogs",
    icon: "ScrollText",
    permissionCode: "audit_logs:read",
    isExternal: false,
    isVisible: true,
    keepAlive: true,
    sortOrder: 10,
  },
];

/**
 * 按父节点优先顺序把默认菜单模板复制到指定组织。
 *
 * @param organizationId 接收菜单模板的组织 ID。
 * @param executor 负责持久化单个菜单节点并返回数据库 ID 的执行器。
 * @returns 全部模板节点写入后无返回值。
 * @throws 父模板节点尚未写入或底层持久化失败时传播异常。
 */
export async function copyMenuTemplate(
  organizationId: string,
  executor: MenuTemplateExecutor,
): Promise<void> {
  const generatedIdByTemplateKey = new Map<string, number>();

  for (const node of DEFAULT_MENU_TEMPLATE) {
    let parentId: number | null;

    if (node.parentTemplateKey) {
      const generatedParentId = generatedIdByTemplateKey.get(node.parentTemplateKey);

      if (generatedParentId === undefined) {
        throw new Error(`Menu template parent was not inserted: ${node.parentTemplateKey}`);
      }

      parentId = generatedParentId;
    } else {
      parentId = null;
    }

    const id = await executor.insertMenu({
      organizationId,
      parentId,
      type: node.type,
      name: node.name,
      routeKey: node.routeKey,
      path: null,
      icon: node.icon,
      permissionCode: node.permissionCode,
      isExternal: node.isExternal,
      isVisible: node.isVisible,
      keepAlive: node.keepAlive,
      sortOrder: node.sortOrder,
    });

    generatedIdByTemplateKey.set(node.templateKey, id);
  }
}
