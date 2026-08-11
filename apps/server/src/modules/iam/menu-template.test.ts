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

    expect(routeKeys).toEqual(["Dashboard", "Members", "Roles", "Menus", "Sessions", "AuditLogs"]);
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

    expect(accessControl).toMatchObject({ id: 2, parentId: null, type: "directory" });
    expect(members).toMatchObject({ parentId: 2, type: "menu", path: null });
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
