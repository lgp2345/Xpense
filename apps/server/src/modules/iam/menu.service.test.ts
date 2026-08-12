import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { menus } from "../../db/schema.js";
import { MenuRepository } from "./menu.repository.js";
import { MenuService } from "./menu.service.js";
import type { MenuTreeNode } from "./menu-tree.js";

vi.mock("@xpense/shared", async (importOriginal) => {
  const shared = await importOriginal<typeof import("@xpense/shared")>();

  return {
    ...shared,
    ROUTE_DEFINITIONS: {
      ...shared.ROUTE_DEFINITIONS,
      MemberDetails: { path: "/members/$memberId" },
      OptionalMember: { path: "/optional/$memberId?" },
      SplatFiles: { path: "/files/$" },
      QueryRoute: { path: "/reports?tab=all" },
      HashRoute: { path: "/reports#summary" },
    },
  };
});

const organizationId = "organization-1";
const otherOrganizationId = "organization-2";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId,
  isSuperAdmin: false,
  permissions: ["dashboard:read", "members:read", "members:update"],
};

function directory(
  id: number,
  parentId: number | null,
  overrides: Partial<MenuTreeNode> = {},
): MenuTreeNode {
  return {
    id,
    organizationId,
    type: "directory",
    name: `目录 ${id}`,
    parentId,
    routeKey: null,
    path: null,
    icon: "Shield",
    permissionCode: null,
    isExternal: null,
    isVisible: true,
    keepAlive: null,
    sortOrder: id,
    ...overrides,
  };
}

function menu(
  id: number,
  parentId: number | null,
  routeKey: string,
  permissionCode: PermissionKey,
  overrides: Partial<MenuTreeNode> = {},
): MenuTreeNode {
  return {
    id,
    organizationId,
    type: "menu",
    name: `菜单 ${id}`,
    parentId,
    routeKey,
    path: null,
    icon: "Users",
    permissionCode,
    isExternal: false,
    isVisible: true,
    keepAlive: false,
    sortOrder: id,
    ...overrides,
  };
}

function externalMenu(
  id: number,
  url: string,
  overrides: Partial<MenuTreeNode> = {},
): MenuTreeNode {
  return menu(id, null, "Dashboard", "dashboard:read", {
    routeKey: null,
    path: url,
    isExternal: true,
    keepAlive: null,
    ...overrides,
  });
}

function button(id: number, parentId: number): MenuTreeNode {
  return {
    id,
    organizationId,
    type: "button",
    name: `按钮 ${id}`,
    parentId,
    routeKey: null,
    path: null,
    icon: null,
    permissionCode: "members:update",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: id,
  };
}

async function createHarness(rows: MenuTreeNode[] = []) {
  const repository = {
    listByOrganizationId: vi.fn().mockResolvedValue(rows),
  };
  const module = await Test.createTestingModule({
    providers: [
      MenuService,
      {
        provide: MenuRepository,
        useValue: repository,
      },
    ],
  }).compile();

  return {
    repository,
    service: module.get(MenuService),
  };
}

describe("MenuRepository", () => {
  it("selects the new menu fields with one organization-scoped ordered query", async () => {
    const rows = [menu(1, null, "Dashboard", "dashboard:read")];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const repository = new MenuRepository({ select } as never);

    await expect(repository.listByOrganizationId(organizationId)).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledWith({
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
    });
    expect(from).toHaveBeenCalledWith(menus);

    const condition = where.mock.calls[0]?.[0] as {
      queryChunks: Array<{ value?: unknown } | unknown>;
    };
    expect(condition.queryChunks[1]).toBe(menus.organizationId);
    expect(condition.queryChunks[2]).toMatchObject({ value: [" = "] });
    expect(condition.queryChunks[3]).toMatchObject({ value: organizationId });

    const ordering = orderBy.mock.calls[0] as Array<{ queryChunks: unknown[] }>;
    expect(ordering[0]?.queryChunks[1]).toBe(menus.sortOrder);
    expect(ordering[0]?.queryChunks[2]).toMatchObject({ value: [" asc"] });
    expect(ordering[1]?.queryChunks[1]).toBe(menus.id);
    expect(ordering[1]?.queryChunks[2]).toMatchObject({ value: [" asc"] });
    expect(select).toHaveBeenCalledOnce();
  });
});

describe("MenuService", () => {
  describe("getAuthorizedMenus", () => {
    it("returns only authorized navigation from the current organization without buttons", async () => {
      const rows = [
        directory(1, null),
        menu(2, 1, "Dashboard", "dashboard:read"),
        button(3, 2),
        menu(4, 1, "Roles", "roles:read"),
        menu(5, null, "Members", "members:read", {
          organizationId: otherOrganizationId,
        }),
      ];
      const { repository, service } = await createHarness(rows);

      const result = await service.getAuthorizedMenus(authContext);

      expect(result).toEqual([
        {
          id: 1,
          parentId: null,
          type: "directory",
          name: "目录 1",
          icon: "Shield",
          isVisible: true,
          routeKey: null,
          path: null,
          url: null,
          permissionCode: null,
          isExternal: null,
          keepAlive: null,
          sortOrder: 1,
          children: [
            {
              id: 2,
              parentId: 1,
              type: "menu",
              name: "菜单 2",
              icon: "Users",
              isVisible: true,
              routeKey: "Dashboard",
              path: "/",
              url: null,
              permissionCode: "dashboard:read",
              isExternal: false,
              keepAlive: false,
              sortOrder: 2,
              children: [],
            },
          ],
        },
      ]);
      expect(repository.listByOrganizationId).toHaveBeenCalledOnce();
      expect(repository.listByOrganizationId).toHaveBeenCalledWith(organizationId);
    });

    it("lets a super admin see all visible navigation and maps an external path to url", async () => {
      const rows = [
        menu(1, null, "Roles", "roles:read"),
        externalMenu(2, "https://docs.example.com"),
      ];
      const { repository, service } = await createHarness(rows);

      const result = await service.getAuthorizedMenus({
        ...authContext,
        isSuperAdmin: true,
        permissions: [],
      });

      expect(result).toMatchObject([
        { id: 1, path: "/roles", url: null },
        { id: 2, path: null, url: "https://docs.example.com" },
      ]);
      expect(repository.listByOrganizationId).toHaveBeenCalledOnce();
    });
  });

  describe("getConfiguration", () => {
    it("includes hidden pages and buttons while preserving organization scope", async () => {
      const rows = [
        directory(1, null),
        menu(2, 1, "Members", "members:read", { isVisible: false }),
        button(3, 2),
        menu(4, null, "Dashboard", "dashboard:read", {
          organizationId: otherOrganizationId,
        }),
      ];
      const { repository, service } = await createHarness(rows);

      const result = await service.getConfiguration(authContext);

      expect(result[0]).toMatchObject({
        id: 1,
        children: [
          {
            id: 2,
            isVisible: false,
            path: "/members",
            children: [{ id: 3, type: "button" }],
          },
        ],
      });
      expect(result).toHaveLength(1);
      expect(repository.listByOrganizationId).toHaveBeenCalledOnce();
      expect(repository.listByOrganizationId).toHaveBeenCalledWith(organizationId);
    });
  });

  describe("resolveRoute", () => {
    it("resolves an authorized hidden route from the shared registry", async () => {
      const { repository, service } = await createHarness([
        menu(1, null, "Members", "members:read", { isVisible: false }),
      ]);

      await expect(service.resolveRoute(authContext, "/members")).resolves.toMatchObject({
        id: 1,
        routeKey: "Members",
        path: "/members",
        isVisible: false,
      });
      expect(repository.listByOrganizationId).toHaveBeenCalledOnce();
    });

    it("matches only required $param segments from the shared registry", async () => {
      const { service } = await createHarness([
        menu(1, null, "MemberDetails", "members:read", { isVisible: false }),
      ]);

      await expect(service.resolveRoute(authContext, "/members/member-42")).resolves.toMatchObject({
        id: 1,
        routeKey: "MemberDetails",
        path: "/members/$memberId",
      });
      await expect(service.resolveRoute(authContext, "/members")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.resolveRoute(authContext, "/members/member-42/extra"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ["optional parameter", "OptionalMember", "/optional/member-42"],
      ["splat", "SplatFiles", "/files/archive/report.pdf"],
      ["query definition", "QueryRoute", "/reports"],
      ["hash definition", "HashRoute", "/reports"],
    ])("rejects %s route definitions", async (_name, routeKey, path) => {
      const { service } = await createHarness([
        menu(1, null, routeKey, "members:read", { isVisible: false }),
      ]);

      await expect(service.resolveRoute(authContext, path)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([
      "/members?tab=active",
      "/members#summary",
    ])("rejects request paths containing query or hash fragments: %s", async (path) => {
      const { service } = await createHarness([menu(1, null, "Members", "members:read")]);

      await expect(service.resolveRoute(authContext, path)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws forbidden for a configured route without permission", async () => {
      const { repository, service } = await createHarness([menu(1, null, "Roles", "roles:read")]);

      await expect(service.resolveRoute(authContext, "/roles")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.listByOrganizationId).toHaveBeenCalledOnce();
    });

    it.each([
      ["registered but unconfigured route", "/audit-logs"],
      ["unknown route", "/not-registered"],
    ])("throws not found for %s", async (_name, path) => {
      const { repository, service } = await createHarness([]);

      await expect(service.resolveRoute(authContext, path)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.listByOrganizationId).toHaveBeenCalledOnce();
    });

    it("recovers from stale local state by reading the organization again", async () => {
      const { repository, service } = await createHarness([]);
      repository.listByOrganizationId
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([menu(1, null, "Members", "members:read", { isVisible: false })]);

      await expect(service.resolveRoute(authContext, "/members")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.resolveRoute(authContext, "/members")).resolves.toMatchObject({ id: 1 });
      expect(repository.listByOrganizationId).toHaveBeenCalledTimes(2);
    });
  });
});
