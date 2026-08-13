import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MenuConfigurationNode, PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { IamApi } from "../../services/iam-api";
import { type MenuRouteOption, menuFormSchema } from "./menu-form-schema";
import { MenuManagementPage } from "./menu-management-page";
import { getMenuParentOptions } from "./menu-parent-options";

const routeOptions: MenuRouteOption[] = [
  { key: "Dashboard", label: "仪表盘", path: "/" },
  { key: "Members", label: "成员管理", path: "/members" },
  { key: "Roles", label: "角色管理", path: "/roles" },
];

const menuTree: MenuConfigurationNode[] = [
  {
    id: 1,
    parentId: null,
    type: "directory",
    name: "系统管理",
    sortOrder: 0,
    icon: "Shield",
    isVisible: true,
    routeKey: null,
    path: null,
    url: null,
    permissionCode: null,
    isExternal: null,
    keepAlive: null,
    children: [
      {
        id: 2,
        parentId: 1,
        type: "directory",
        name: "组织设置",
        sortOrder: 0,
        icon: null,
        isVisible: true,
        routeKey: null,
        path: null,
        url: null,
        permissionCode: null,
        isExternal: null,
        keepAlive: null,
        children: [
          {
            id: 3,
            parentId: 2,
            type: "menu",
            name: "成员管理",
            sortOrder: 0,
            icon: "Users",
            isVisible: true,
            routeKey: "Members",
            path: "/members",
            url: null,
            permissionCode: "members:read",
            isExternal: false,
            keepAlive: true,
            children: [
              {
                id: 4,
                parentId: 3,
                type: "button",
                name: "新增成员按钮",
                sortOrder: 0,
                icon: null,
                isVisible: null,
                routeKey: null,
                path: null,
                url: null,
                permissionCode: "members:create",
                isExternal: null,
                keepAlive: null,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 5,
    parentId: null,
    type: "directory",
    name: "隐藏分组",
    sortOrder: 1,
    icon: null,
    isVisible: false,
    routeKey: null,
    path: null,
    url: null,
    permissionCode: null,
    isExternal: null,
    keepAlive: null,
    children: [
      {
        id: 6,
        parentId: 5,
        type: "menu",
        name: "角色管理",
        sortOrder: 0,
        icon: "ShieldCheck",
        isVisible: true,
        routeKey: "Roles",
        path: "/roles",
        url: null,
        permissionCode: "roles:read",
        isExternal: false,
        keepAlive: false,
        children: [],
      },
    ],
  },
  {
    id: 7,
    parentId: null,
    type: "menu",
    name: "仪表盘",
    sortOrder: 2,
    icon: "LayoutDashboard",
    isVisible: true,
    routeKey: "Dashboard",
    path: "/",
    url: null,
    permissionCode: "dashboard:read",
    isExternal: false,
    keepAlive: false,
    children: [
      {
        id: 8,
        parentId: 7,
        type: "menu",
        name: "仪表盘详情",
        sortOrder: 0,
        icon: null,
        isVisible: true,
        routeKey: "Roles",
        path: "/roles",
        url: null,
        permissionCode: "roles:read",
        isExternal: false,
        keepAlive: false,
        children: [],
      },
    ],
  },
  {
    id: 9,
    parentId: null,
    type: "menu",
    name: "产品文档",
    sortOrder: 3,
    icon: "ScrollText",
    isVisible: true,
    routeKey: null,
    path: null,
    url: "https://docs.example.com",
    permissionCode: "menus:read",
    isExternal: true,
    keepAlive: null,
    children: [],
  },
];

type MenusApi = Pick<
  IamApi,
  "addMenu" | "deleteMenu" | "editMenu" | "editMenuOrder" | "getMenuConfiguration"
>;

function createMenusApi(overrides: Partial<MenusApi> = {}): MenusApi {
  return {
    addMenu: vi.fn().mockResolvedValue(undefined),
    deleteMenu: vi.fn().mockResolvedValue(undefined),
    editMenu: vi.fn().mockResolvedValue(undefined),
    editMenuOrder: vi.fn().mockResolvedValue(undefined),
    getMenuConfiguration: vi.fn().mockResolvedValue(menuTree),
    ...overrides,
  };
}

const allMenuPermissions: PermissionKey[] = [
  "menus:read",
  "menus:create",
  "menus:update",
  "menus:delete",
];

function renderPage(
  options: { api?: MenusApi; items?: MenuConfigurationNode[]; permissions?: PermissionKey[] } = {},
) {
  render(
    <MenuManagementPage
      api={options.api}
      menuItems={options.items ?? menuTree}
      permissions={options.permissions ?? allMenuPermissions}
      routeOptions={routeOptions}
    />,
  );
}

describe("menu form schema", () => {
  it("accepts the four exact node shapes and rejects non-HTTP external links", () => {
    const values = [
      {
        type: "directory",
        name: "系统管理",
        parentId: null,
        icon: "Shield",
        isVisible: true,
      },
      {
        type: "menu",
        name: "成员管理",
        parentId: 1,
        routeKey: "Members",
        icon: "Users",
        permissionCode: "members:read",
        isExternal: false,
        isVisible: true,
        keepAlive: true,
      },
      {
        type: "menu",
        name: "产品文档",
        parentId: 1,
        url: "https://docs.example.com",
        icon: "ScrollText",
        permissionCode: "menus:read",
        isExternal: true,
        isVisible: true,
      },
      {
        type: "button",
        name: "新增成员",
        parentId: 3,
        permissionCode: "members:create",
      },
    ] as const;

    for (const value of values) {
      expect(menuFormSchema.safeParse(value).success).toBe(true);
    }

    expect(
      menuFormSchema.safeParse({
        ...values[2],
        url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});

describe("getMenuParentOptions", () => {
  it("shares the server hierarchy rules and excludes the edited subtree", () => {
    expect(
      getMenuParentOptions(menuTree, { type: "directory" }).map((option) => option.id),
    ).toEqual([1, 5]);
    expect(getMenuParentOptions(menuTree, { type: "menu" }).map((option) => option.id)).toEqual([
      1, 2, 3, 5, 6, 7, 8,
    ]);
    expect(getMenuParentOptions(menuTree, { type: "button" }).map((option) => option.id)).toEqual([
      3, 6, 7, 8,
    ]);
    expect(
      getMenuParentOptions(menuTree, { type: "directory", editingNodeId: 1 }).map(
        (option) => option.id,
      ),
    ).toEqual([5]);
    expect(
      getMenuParentOptions(menuTree, { type: "menu", editingNodeId: 7 }).map((option) => option.id),
    ).not.toEqual(expect.arrayContaining([7, 8]));
  });
});

describe("MenuManagementPage", () => {
  it("shows a safe load error and retries the configuration request", async () => {
    const user = userEvent.setup();
    const api = createMenusApi({
      getMenuConfiguration: vi
        .fn()
        .mockRejectedValueOnce(new Error("authorization=secret"))
        .mockResolvedValueOnce(menuTree),
    });

    render(
      <MenuManagementPage api={api} permissions={allMenuPermissions} routeOptions={routeOptions} />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("加载菜单配置失败，请稍后重试。");
    expect(screen.queryByText(/authorization=secret/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("系统管理")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(api.getMenuConfiguration).toHaveBeenCalledTimes(2);
  });

  it("switches the add dialog through every node type and shows route label, path, and key", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "新增根节点" }));
    expect(screen.getByRole("textbox", { name: "名称" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "父目录" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "图标" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "自身可见" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "节点类型" }));
    await user.click(screen.getByRole("option", { name: "菜单" }));

    expect(screen.getByRole("combobox", { name: "菜单模式" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "注册路由" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "权限" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "页面保活" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "注册路由" }));
    const routeOption = screen.getByRole("option", { name: /成员管理.*\/members.*Members/ });
    expect(routeOption).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("combobox", { name: "菜单模式" }));
    await user.click(screen.getByRole("option", { name: "外链菜单" }));
    expect(screen.getByRole("textbox", { name: "外链 URL" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "页面保活" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "节点类型" }));
    await user.click(screen.getByRole("option", { name: "按钮" }));
    expect(screen.getByRole("combobox", { name: "所属菜单" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "图标" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "自身可见" })).not.toBeInTheDocument();
  });

  it("explains effective visibility, page descendants, sort boundaries, and non-leaf deletion", () => {
    renderPage();

    expect(screen.getByText("自身可见 · 受父级隐藏")).toBeInTheDocument();
    expect(screen.getByText("不进入导航 · 位于菜单页面下")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上移 系统管理" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下移 产品文档" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 系统管理" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 系统管理" })).toHaveAttribute(
      "title",
      "包含子节点，不能删除",
    );
  });

  it("asks for destructive confirmation before deleting a leaf and refreshes after success", async () => {
    const user = userEvent.setup();
    const api = createMenusApi();
    renderPage({ api });

    await user.click(screen.getByRole("button", { name: "删除 产品文档" }));

    const confirmation = screen.getByRole("alertdialog");
    expect(confirmation).toHaveTextContent("确认删除菜单节点");
    expect(confirmation).toHaveTextContent("产品文档");
    expect(api.deleteMenu).not.toHaveBeenCalled();

    await user.click(within(confirmation).getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.deleteMenu).toHaveBeenCalledWith(9));
    await waitFor(() => expect(api.getMenuConfiguration).toHaveBeenCalledOnce());
  });

  it("preserves entered values after a server error and refreshes after a successful retry", async () => {
    const user = userEvent.setup();
    const api = createMenusApi({
      addMenu: vi
        .fn()
        .mockRejectedValueOnce(new Error("permission token=secret"))
        .mockResolvedValueOnce(undefined),
    });
    renderPage({ api });

    await user.click(screen.getByRole("button", { name: "新增根节点" }));
    await user.type(screen.getByRole("textbox", { name: "名称" }), "新的配置目录");
    await user.click(screen.getByRole("button", { name: "创建节点" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("创建菜单节点失败，请稍后重试。");
    expect(screen.queryByText(/token=secret/i)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "名称" })).toHaveValue("新的配置目录");

    await user.click(screen.getByRole("button", { name: "创建节点" }));

    await waitFor(() => expect(api.addMenu).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getMenuConfiguration).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("posts the requested sibling direction and refreshes the tree", async () => {
    const user = userEvent.setup();
    const api = createMenusApi();
    renderPage({ api });

    await user.click(screen.getByRole("button", { name: "上移 隐藏分组" }));

    await waitFor(() => expect(api.editMenuOrder).toHaveBeenCalledWith(5, "up"));
    await waitFor(() => expect(api.getMenuConfiguration).toHaveBeenCalledOnce());
  });
});
