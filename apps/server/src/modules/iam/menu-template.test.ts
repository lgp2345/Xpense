import { describe, expect, it } from "vitest";

import {
  copyMenuTemplate,
  DEFAULT_MENU_TEMPLATE,
  type MenuTemplateInsert,
} from "./menu-template.js";

describe("DEFAULT_MENU_TEMPLATE", () => {
  it("covers every registered management route", () => {
    const routeKeys = DEFAULT_MENU_TEMPLATE.flatMap((node) =>
      node.type === "menu" && node.routeKey ? [node.routeKey] : [],
    );

    expect(routeKeys).toEqual([
      "Dashboard",
      "Transactions",
      "Accounts",
      "Categories",
      "Members",
      "Roles",
      "Menus",
      "Sessions",
      "AuditLogs",
    ]);
  });

  it("defines the bookkeeping hierarchy with its action permissions", () => {
    const bookkeepingNodes = DEFAULT_MENU_TEMPLATE.filter(
      (node) =>
        node.templateKey === "bookkeeping" ||
        node.templateKey.startsWith("transactions") ||
        node.templateKey.startsWith("accounts") ||
        node.templateKey.startsWith("categories"),
    ).map((node) => ({
      key: node.templateKey,
      parent: node.parentTemplateKey,
      type: node.type,
      route: node.routeKey,
      permission: node.permissionCode,
    }));

    expect(bookkeepingNodes).toEqual([
      { key: "bookkeeping", parent: null, type: "directory", route: null, permission: null },
      {
        key: "transactions",
        parent: "bookkeeping",
        type: "menu",
        route: "Transactions",
        permission: "transactions:read",
      },
      {
        key: "transactions.create",
        parent: "transactions",
        type: "button",
        route: null,
        permission: "transactions:create",
      },
      {
        key: "transactions.update",
        parent: "transactions",
        type: "button",
        route: null,
        permission: "transactions:update",
      },
      {
        key: "transactions.delete",
        parent: "transactions",
        type: "button",
        route: null,
        permission: "transactions:delete",
      },
      {
        key: "accounts",
        parent: "bookkeeping",
        type: "menu",
        route: "Accounts",
        permission: "accounts:read",
      },
      {
        key: "accounts.create",
        parent: "accounts",
        type: "button",
        route: null,
        permission: "accounts:create",
      },
      {
        key: "accounts.update",
        parent: "accounts",
        type: "button",
        route: null,
        permission: "accounts:update",
      },
      {
        key: "accounts.delete",
        parent: "accounts",
        type: "button",
        route: null,
        permission: "accounts:delete",
      },
      {
        key: "categories",
        parent: "bookkeeping",
        type: "menu",
        route: "Categories",
        permission: "categories:read",
      },
      {
        key: "categories.create",
        parent: "categories",
        type: "button",
        route: null,
        permission: "categories:create",
      },
      {
        key: "categories.update",
        parent: "categories",
        type: "button",
        route: null,
        permission: "categories:update",
      },
      {
        key: "categories.delete",
        parent: "categories",
        type: "button",
        route: null,
        permission: "categories:delete",
      },
    ]);
  });

  it("sorts bookkeeping after dashboard and before access control", () => {
    const dashboard = DEFAULT_MENU_TEMPLATE.find((node) => node.templateKey === "dashboard");
    const bookkeeping = DEFAULT_MENU_TEMPLATE.find((node) => node.templateKey === "bookkeeping");
    const accessControl = DEFAULT_MENU_TEMPLATE.find(
      (node) => node.templateKey === "access-control",
    );

    expect(bookkeeping?.sortOrder).toBeGreaterThan(dashboard?.sortOrder ?? Number.MAX_SAFE_INTEGER);
    expect(bookkeeping?.sortOrder).toBeLessThan(
      accessControl?.sortOrder ?? Number.MIN_SAFE_INTEGER,
    );
  });

  it("gives every non-root node an existing parent that is inserted first", () => {
    const indexByTemplateKey = new Map(
      DEFAULT_MENU_TEMPLATE.map((node, index) => [node.templateKey, index]),
    );

    for (const [index, node] of DEFAULT_MENU_TEMPLATE.entries()) {
      if (!node.parentTemplateKey) {
        continue;
      }

      const parentIndex = indexByTemplateKey.get(node.parentTemplateKey);

      expect(parentIndex).toBeTypeOf("number");
      expect(parentIndex).toBeLessThan(index);
    }
  });

  it("keeps every template key unique when focused templates are aggregated", () => {
    const templateKeys = DEFAULT_MENU_TEMPLATE.map((node) => node.templateKey);

    expect(new Set(templateKeys).size).toBe(templateKeys.length);
    expect(templateKeys.filter((key) => key === "access-control")).toHaveLength(1);
  });

  it("includes the action permissions for menu management", () => {
    const menuActions = DEFAULT_MENU_TEMPLATE.filter(
      (node) => node.parentTemplateKey === "menus",
    ).map((node) => node.permissionCode);

    expect(menuActions).toEqual(["menus:create", "menus:update", "menus:delete"]);
  });

  it("includes every supported management action as a button", () => {
    const buttonPermissions = DEFAULT_MENU_TEMPLATE.filter((node) => node.type === "button").map(
      (node) => node.permissionCode,
    );

    expect(buttonPermissions).toEqual([
      "transactions:create",
      "transactions:update",
      "transactions:delete",
      "accounts:create",
      "accounts:update",
      "accounts:delete",
      "categories:create",
      "categories:update",
      "categories:delete",
      "members:create",
      "members:update",
      "members:disable",
      "members:enable",
      "roles:create",
      "roles:update",
      "roles:delete",
      "roles:permissions:update",
      "menus:create",
      "menus:update",
      "menus:delete",
      "sessions:revoke",
    ]);
  });

  it("contains only internal navigation, whose paths are derived by the API", () => {
    const navigationNodes = DEFAULT_MENU_TEMPLATE.filter((node) => node.type === "menu");

    expect(navigationNodes.every((node) => node.isExternal === false)).toBe(true);
  });
});

describe("copyMenuTemplate", () => {
  it("persists children with the generated numeric ID of their template parent", async () => {
    const executor = new InMemoryMenuTemplateExecutor();

    await copyMenuTemplate("organization-1", executor);

    const accessControl = executor.rows.find((row) => row.name === "访问控制");
    const members = executor.rows.find((row) => row.routeKey === "Members");
    const memberCreate = executor.rows.find((row) => row.permissionCode === "members:create");

    expect(accessControl).toMatchObject({ parentId: null, type: "directory" });
    expect(members).toMatchObject({ parentId: accessControl?.id, type: "menu", path: null });
    expect(memberCreate).toMatchObject({ parentId: members?.id, type: "button", routeKey: null });
    expect(executor.rows.every((row) => "templateKey" in row === false)).toBe(true);
  });
});

class InMemoryMenuTemplateExecutor {
  readonly rows: Array<MenuTemplateInsert & { id: number }> = [];

  async insertMenu(input: MenuTemplateInsert): Promise<number> {
    const id = this.rows.length + 1;

    this.rows.push({ ...input, id });
    return id;
  }
}
