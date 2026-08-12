import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { menus } from "../../db/schema.js";
import { AuditService } from "../audit/audit.service.js";
import { addMenuSchema } from "./dto/add-menu.dto.js";
import { deleteMenuSchema } from "./dto/delete-menu.dto.js";
import { editMenuSchema } from "./dto/edit-menu.dto.js";
import { editMenuOrderSchema } from "./dto/edit-menu-order.dto.js";
import { resetOrganizationMenusSchema } from "./dto/reset-organization-menus.dto.js";
import { resolveMenuSchema } from "./dto/resolve-menu.dto.js";
import { MenuRepository } from "./menu.repository.js";
import { MenuService } from "./menu.service.js";
import { DEFAULT_MENU_TEMPLATE } from "./menu-template.js";
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
  const state = {
    rows: rows.map((row) => ({ ...row })),
  };
  const transaction = { id: "menu-transaction-1" };
  const repository = {
    listByOrganizationId: vi
      .fn()
      .mockImplementation(async (scopedOrganizationId: string) =>
        state.rows
          .filter((row) => row.organizationId === scopedOrganizationId)
          .map((row) => ({ ...row })),
      ),
    runInTransaction: vi
      .fn()
      .mockImplementation(async (operation: (currentTransaction: object) => Promise<unknown>) =>
        operation(transaction),
      ),
    lockByOrganizationId: vi
      .fn()
      .mockImplementation(async (scopedOrganizationId: string) =>
        state.rows
          .filter((row) => row.organizationId === scopedOrganizationId)
          .map((row) => ({ ...row })),
      ),
    insertMenu: vi.fn().mockImplementation(async (input: Omit<MenuTreeNode, "id">) => {
      const id = Math.max(0, ...state.rows.map((row) => row.id)) + 1;
      const row = { id, ...input };
      state.rows.push(row);
      return { ...row };
    }),
    updateMenu: vi.fn().mockImplementation(async (input: MenuTreeNode) => {
      const index = state.rows.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.id,
      );

      if (index === -1) {
        throw new Error("menu unavailable");
      }

      state.rows[index] = { ...input };
      return { ...input };
    }),
    deleteMenu: vi.fn().mockImplementation(async (scopedOrganizationId: string, id: number) => {
      const index = state.rows.findIndex(
        (row) => row.organizationId === scopedOrganizationId && row.id === id,
      );

      if (index !== -1) {
        state.rows.splice(index, 1);
      }
    }),
    setMenuSortOrders: vi
      .fn()
      .mockImplementation(
        async (scopedOrganizationId: string, updates: Array<{ id: number; sortOrder: number }>) => {
          for (const update of updates) {
            const row = state.rows.find(
              (candidate) =>
                candidate.organizationId === scopedOrganizationId && candidate.id === update.id,
            );

            if (row) {
              row.sortOrder = update.sortOrder;
            }
          }
        },
      ),
    deleteByOrganizationId: vi.fn().mockImplementation(async (scopedOrganizationId: string) => {
      state.rows = state.rows.filter((row) => row.organizationId !== scopedOrganizationId);
    }),
  };
  const auditService = {
    appendRequired: vi.fn().mockResolvedValue(undefined),
  };
  const module = await Test.createTestingModule({
    providers: [
      MenuService,
      {
        provide: MenuRepository,
        useValue: repository,
      },
      {
        provide: AuditService,
        useValue: auditService,
      },
    ],
  }).compile();

  return {
    auditService,
    repository,
    service: module.get(MenuService),
    state,
    transaction,
  };
}

function containsReference(value: unknown, target: unknown, seen = new Set<unknown>()): boolean {
  if (value === target) {
    return true;
  }

  if (value === null || typeof value !== "object" || seen.has(value)) {
    return false;
  }

  seen.add(value);

  return Object.values(value).some((entry) => containsReference(entry, target, seen));
}

describe("menu DTO schemas", () => {
  const directoryInput = {
    type: "directory" as const,
    name: "系统管理",
    parentId: null,
    icon: "Shield" as const,
    isVisible: true,
  };
  const internalMenuInput = {
    type: "menu" as const,
    name: "成员管理",
    parentId: 1,
    routeKey: "Members" as const,
    icon: "Users" as const,
    permissionCode: "members:read" as const,
    isExternal: false as const,
    isVisible: true,
    keepAlive: false,
  };
  const externalMenuInput = {
    type: "menu" as const,
    name: "帮助中心",
    parentId: null,
    url: "https://docs.example.com/help",
    icon: null,
    permissionCode: "menus:read" as const,
    isExternal: true as const,
    isVisible: true,
  };
  const buttonInput = {
    type: "button" as const,
    name: "编辑成员",
    parentId: 2,
    permissionCode: "members:update" as const,
  };

  it.each([
    directoryInput,
    internalMenuInput,
    externalMenuInput,
    buttonInput,
  ])("accepts the add-menu $type discriminated shape", (input) => {
    expect(addMenuSchema.parse(input)).toEqual(input);
  });

  it.each([
    directoryInput,
    internalMenuInput,
    externalMenuInput,
    buttonInput,
  ])("accepts the edit-menu $type discriminated shape with a numeric id", (input) => {
    expect(editMenuSchema.parse({ id: 42, ...input })).toEqual({ id: 42, ...input });
  });

  it("rejects an internal menu without a registered route key", () => {
    const { routeKey: _routeKey, ...missingRouteKey } = internalMenuInput;

    expect(addMenuSchema.safeParse(missingRouteKey).success).toBe(false);
  });

  it("rejects non-HTTP external menu URLs", () => {
    expect(
      addMenuSchema.safeParse({ ...externalMenuInput, url: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(addMenuSchema.safeParse({ ...externalMenuInput, url: "not a URL" }).success).toBe(false);
  });

  it("validates delete, sibling order, route resolution and reset DTOs", () => {
    expect(deleteMenuSchema.parse({ id: 7 })).toEqual({ id: 7 });
    expect(editMenuOrderSchema.parse({ id: 7, direction: "up" })).toEqual({
      id: 7,
      direction: "up",
    });
    expect(resolveMenuSchema.parse({ path: "/members/member-42" })).toEqual({
      path: "/members/member-42",
    });
    expect(
      resetOrganizationMenusSchema.parse({
        organizationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({ organizationId: "11111111-1111-4111-8111-111111111111" });
  });

  it("rejects invalid ids, sort directions, route paths and organization ids", () => {
    expect(deleteMenuSchema.safeParse({ id: 0 }).success).toBe(false);
    expect(editMenuOrderSchema.safeParse({ id: 7, direction: "left" }).success).toBe(false);
    expect(resolveMenuSchema.safeParse({ path: "members" }).success).toBe(false);
    expect(
      resetOrganizationMenusSchema.safeParse({ organizationId: "organization-1" }).success,
    ).toBe(false);
  });
});

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

  it("scopes an update by both organization and numeric menu id", async () => {
    const row = menu(42, null, "Members", "members:read");
    const returning = vi.fn().mockResolvedValue([row]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const repository = new MenuRepository({ update } as never);

    await expect(repository.updateMenu(row)).resolves.toEqual(row);

    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, menus.organizationId)).toBe(true);
    expect(containsReference(condition, organizationId)).toBe(true);
    expect(containsReference(condition, menus.id)).toBe(true);
    expect(containsReference(condition, 42)).toBe(true);
  });

  it("locks all organization rows with one ordered FOR UPDATE query", async () => {
    const rows = [menu(1, null, "Members", "members:read")];
    const forUpdate = vi.fn().mockResolvedValue(rows);
    const orderBy = vi.fn().mockReturnValue({ for: forUpdate });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const transaction = { select };
    const repository = new MenuRepository({} as never);

    await expect(
      repository.lockByOrganizationId(organizationId, transaction as never),
    ).resolves.toEqual(rows);
    expect(forUpdate).toHaveBeenCalledWith("update");
    expect(containsReference(where.mock.calls[0]?.[0], menus.organizationId)).toBe(true);
    expect(containsReference(where.mock.calls[0]?.[0], organizationId)).toBe(true);
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

  describe("addMenu", () => {
    const internalInput = {
      type: "menu" as const,
      name: "新增成员菜单",
      parentId: 1,
      routeKey: "Members" as const,
      icon: "Users" as const,
      permissionCode: "members:read" as const,
      isExternal: false as const,
      isVisible: true,
      keepAlive: false,
    };

    it("locks the current organization, appends to siblings and audits the created node", async () => {
      const { auditService, repository, service, state, transaction } = await createHarness([
        directory(1, null, { sortOrder: 10 }),
        menu(2, 1, "Dashboard", "dashboard:read", { sortOrder: 30 }),
        menu(3, null, "Roles", "roles:read", {
          organizationId: otherOrganizationId,
          sortOrder: 99,
        }),
      ]);

      await expect(service.addMenu(authContext, internalInput)).resolves.toMatchObject({
        id: 4,
        organizationId,
        parentId: 1,
        routeKey: "Members",
        path: null,
        sortOrder: 31,
      });
      expect(repository.lockByOrganizationId).toHaveBeenCalledWith(organizationId, transaction);
      expect(repository.insertMenu).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId, parentId: 1, sortOrder: 31 }),
        transaction,
      );
      expect(state.rows.find((row) => row.id === 4)).toMatchObject({
        organizationId,
        routeKey: "Members",
      });
      expect(auditService.appendRequired).toHaveBeenCalledWith(
        {
          organizationId,
          actorUserId: authContext.userId,
          action: "menu.created",
          targetType: "menu",
          targetId: "4",
          result: "succeeded",
          metadata: {
            type: "menu",
            parentId: 1,
          },
        },
        transaction,
      );
    });

    it("rejects duplicate internal routes and external URLs before writing", async () => {
      const internalHarness = await createHarness([menu(1, null, "Members", "members:read")]);
      const externalHarness = await createHarness([
        externalMenu(1, "https://docs.example.com/help"),
      ]);

      await expect(
        internalHarness.service.addMenu(authContext, { ...internalInput, parentId: null }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        externalHarness.service.addMenu(authContext, {
          type: "menu",
          name: "重复帮助",
          parentId: null,
          url: "https://docs.example.com/help",
          icon: null,
          permissionCode: "menus:read",
          isExternal: true,
          isVisible: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(internalHarness.repository.insertMenu).not.toHaveBeenCalled();
      expect(externalHarness.repository.insertMenu).not.toHaveBeenCalled();
    });

    it("rejects a missing route key and an illegal parent", async () => {
      const missingRouteHarness = await createHarness([]);
      const illegalParentHarness = await createHarness([directory(1, null)]);

      await expect(
        missingRouteHarness.service.addMenu(authContext, {
          ...internalInput,
          parentId: null,
          routeKey: undefined,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        illegalParentHarness.service.addMenu(authContext, {
          type: "button",
          name: "错误按钮",
          parentId: 1,
          permissionCode: "members:update",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects an actually visible parameter route", async () => {
      const { repository, service } = await createHarness([]);

      await expect(
        service.addMenu(authContext, {
          ...internalInput,
          parentId: null,
          routeKey: "MemberDetails",
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.insertMenu).not.toHaveBeenCalled();
    });
  });

  describe("editMenu", () => {
    it("moves a parameter route below a hidden parent, appends it and audits the parent change", async () => {
      const { auditService, repository, service, state, transaction } = await createHarness([
        directory(1, null, { isVisible: false }),
        menu(2, null, "MemberDetails", "members:read", {
          isVisible: false,
          sortOrder: 5,
        }),
        menu(3, 1, "Dashboard", "dashboard:read", { sortOrder: 8 }),
      ]);

      await expect(
        service.editMenu(authContext, {
          id: 2,
          type: "menu",
          name: "成员详情",
          parentId: 1,
          routeKey: "MemberDetails",
          icon: "Users",
          permissionCode: "members:read",
          isExternal: false,
          isVisible: true,
          keepAlive: false,
        } as never),
      ).resolves.toMatchObject({ id: 2, parentId: 1, isVisible: true, sortOrder: 9 });
      expect(repository.updateMenu).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, organizationId, parentId: 1, sortOrder: 9 }),
        transaction,
      );
      expect(state.rows.find((row) => row.id === 2)).toMatchObject({
        parentId: 1,
        isVisible: true,
        sortOrder: 9,
      });
      expect(auditService.appendRequired).toHaveBeenCalledWith(
        {
          organizationId,
          actorUserId: authContext.userId,
          action: "menu.updated",
          targetType: "menu",
          targetId: "2",
          result: "succeeded",
          metadata: {
            type: "menu",
            parentIdFrom: null,
            parentIdTo: 1,
          },
        },
        transaction,
      );
    });

    it("keeps the existing sort order when the parent is unchanged", async () => {
      const { repository, service } = await createHarness([
        menu(1, null, "Members", "members:read", { sortOrder: 40 }),
      ]);

      await service.editMenu(authContext, {
        id: 1,
        type: "menu",
        name: "成员列表",
        parentId: null,
        routeKey: "Members",
        icon: "Users",
        permissionCode: "members:read",
        isExternal: false,
        isVisible: false,
        keepAlive: true,
      });

      expect(repository.updateMenu).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, sortOrder: 40 }),
        expect.anything(),
      );
    });

    it("rejects cycles, external nodes with children and duplicate route selection", async () => {
      const cycleHarness = await createHarness([directory(1, null), directory(2, 1)]);
      const externalHarness = await createHarness([
        menu(1, null, "Members", "members:read"),
        button(2, 1),
      ]);
      const duplicateHarness = await createHarness([
        menu(1, null, "Members", "members:read"),
        menu(2, null, "Roles", "roles:read"),
      ]);

      await expect(
        cycleHarness.service.editMenu(authContext, {
          id: 1,
          type: "directory",
          name: "循环目录",
          parentId: 2,
          icon: "Shield",
          isVisible: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        externalHarness.service.editMenu(authContext, {
          id: 1,
          type: "menu",
          name: "外链",
          parentId: null,
          url: "https://docs.example.com",
          icon: null,
          permissionCode: "members:read",
          isExternal: true,
          isVisible: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        duplicateHarness.service.editMenu(authContext, {
          id: 2,
          type: "menu",
          name: "重复成员路由",
          parentId: null,
          routeKey: "Members",
          icon: "Users",
          permissionCode: "members:read",
          isExternal: false,
          isVisible: false,
          keepAlive: false,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("does not reveal a menu from another organization", async () => {
      const { service } = await createHarness([
        menu(9, null, "Members", "members:read", { organizationId: otherOrganizationId }),
      ]);

      await expect(
        service.editMenu(authContext, {
          id: 9,
          type: "menu",
          name: "越权编辑",
          parentId: null,
          routeKey: "Members",
          icon: "Users",
          permissionCode: "members:read",
          isExternal: false,
          isVisible: true,
          keepAlive: false,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("deleteMenu", () => {
    it("deletes a current-organization leaf and appends the audit event in the transaction", async () => {
      const { auditService, repository, service, state, transaction } = await createHarness([
        directory(1, null),
        menu(2, 1, "Members", "members:read"),
      ]);

      await expect(service.deleteMenu(authContext, { id: 2 })).resolves.toBeUndefined();
      expect(state.rows.map((row) => row.id)).toEqual([1]);
      expect(repository.deleteMenu).toHaveBeenCalledWith(organizationId, 2, transaction);
      expect(auditService.appendRequired).toHaveBeenCalledWith(
        {
          organizationId,
          actorUserId: authContext.userId,
          action: "menu.deleted",
          targetType: "menu",
          targetId: "2",
          result: "succeeded",
          metadata: {
            type: "menu",
            parentId: 1,
          },
        },
        transaction,
      );
    });

    it("rejects a non-leaf deletion without writing", async () => {
      const { auditService, repository, service } = await createHarness([
        directory(1, null),
        menu(2, 1, "Members", "members:read"),
      ]);

      await expect(service.deleteMenu(authContext, { id: 1 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.deleteMenu).not.toHaveBeenCalled();
      expect(auditService.appendRequired).not.toHaveBeenCalled();
    });

    it("returns not found for another organization's node id", async () => {
      const { service } = await createHarness([
        menu(9, null, "Members", "members:read", { organizationId: otherOrganizationId }),
      ]);

      await expect(service.deleteMenu(authContext, { id: 9 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("editMenuOrder", () => {
    it("swaps only the adjacent sibling and writes a moved audit event", async () => {
      const { auditService, repository, service, state, transaction } = await createHarness([
        directory(1, null),
        menu(2, 1, "Dashboard", "dashboard:read", { sortOrder: 10 }),
        menu(3, 1, "Members", "members:read", { sortOrder: 20 }),
        menu(4, 1, "Roles", "roles:read", { sortOrder: 30 }),
        menu(5, null, "Sessions", "sessions:read", { sortOrder: 15 }),
      ]);

      await expect(
        service.editMenuOrder(authContext, { id: 3, direction: "up" }),
      ).resolves.toBeUndefined();
      expect(repository.setMenuSortOrders).toHaveBeenCalledWith(
        organizationId,
        [
          { id: 3, sortOrder: 10 },
          { id: 2, sortOrder: 20 },
        ],
        transaction,
      );
      expect(state.rows.find((row) => row.id === 3)?.sortOrder).toBe(10);
      expect(state.rows.find((row) => row.id === 2)?.sortOrder).toBe(20);
      expect(state.rows.find((row) => row.id === 5)?.sortOrder).toBe(15);
      expect(auditService.appendRequired).toHaveBeenCalledWith(
        {
          organizationId,
          actorUserId: authContext.userId,
          action: "menu.moved",
          targetType: "menu",
          targetId: "3",
          result: "succeeded",
          metadata: {
            parentId: 1,
            direction: "up",
            siblingId: 2,
          },
        },
        transaction,
      );
    });

    it.each([
      ["up" as const, 2],
      ["down" as const, 4],
    ])("rejects the %s boundary", async (direction, id) => {
      const { auditService, repository, service } = await createHarness([
        directory(1, null),
        menu(2, 1, "Dashboard", "dashboard:read", { sortOrder: 10 }),
        menu(3, 1, "Members", "members:read", { sortOrder: 20 }),
        menu(4, 1, "Roles", "roles:read", { sortOrder: 30 }),
      ]);

      await expect(service.editMenuOrder(authContext, { id, direction })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.setMenuSortOrders).not.toHaveBeenCalled();
      expect(auditService.appendRequired).not.toHaveBeenCalled();
    });

    it("does not expose another organization's node", async () => {
      const { service } = await createHarness([
        menu(9, null, "Members", "members:read", { organizationId: otherOrganizationId }),
      ]);

      await expect(
        service.editMenuOrder(authContext, { id: 9, direction: "up" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("resetOrganizationMenus", () => {
    it("rejects a non-super-admin before opening a transaction", async () => {
      const { repository, service } = await createHarness([]);

      await expect(
        service.resetOrganizationMenus(authContext, { organizationId: otherOrganizationId }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.runInTransaction).not.toHaveBeenCalled();
    });

    it("replaces only the explicit target tree with the default template and audits counts", async () => {
      const { auditService, repository, service, state, transaction } = await createHarness([
        menu(1, null, "Dashboard", "dashboard:read"),
        directory(9, null, { organizationId: otherOrganizationId }),
        menu(10, 9, "Members", "members:read", {
          organizationId: otherOrganizationId,
        }),
      ]);
      const superAdminContext = { ...authContext, isSuperAdmin: true };

      await expect(
        service.resetOrganizationMenus(superAdminContext, {
          organizationId: otherOrganizationId,
        }),
      ).resolves.toBeUndefined();
      expect(repository.lockByOrganizationId).toHaveBeenCalledWith(
        otherOrganizationId,
        transaction,
      );
      expect(repository.deleteByOrganizationId).toHaveBeenCalledWith(
        otherOrganizationId,
        transaction,
      );
      expect(repository.deleteByOrganizationId.mock.invocationCallOrder[0]).toBeLessThan(
        repository.insertMenu.mock.invocationCallOrder[0] ?? 0,
      );
      expect(state.rows.filter((row) => row.organizationId === organizationId)).toEqual([
        menu(1, null, "Dashboard", "dashboard:read"),
      ]);
      expect(state.rows.filter((row) => row.organizationId === otherOrganizationId)).toHaveLength(
        DEFAULT_MENU_TEMPLATE.length,
      );
      expect(
        state.rows
          .filter((row) => row.organizationId === otherOrganizationId)
          .find((row) => row.routeKey === "Members")?.parentId,
      ).not.toBeNull();
      expect(auditService.appendRequired).toHaveBeenCalledWith(
        {
          organizationId: otherOrganizationId,
          actorUserId: authContext.userId,
          action: "menu.tree_reset",
          targetType: "organization",
          targetId: otherOrganizationId,
          result: "succeeded",
          metadata: {
            replacedNodeCount: 2,
            templateNodeCount: DEFAULT_MENU_TEMPLATE.length,
          },
        },
        transaction,
      );
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
