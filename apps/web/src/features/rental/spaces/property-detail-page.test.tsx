import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalPropertyDetail } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { PropertyDetailPage } from "./property-detail-page";

const detail: RentalPropertyDetail = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  ledgerId: "223e4567-e89b-42d3-a456-426614174000",
  name: "阳光公寓",
  type: "apartment_building",
  customTypeName: null,
  countryCode: "CN",
  province: "广东省",
  city: "深圳市",
  district: "南山区",
  addressLine: "科技园路 88 号",
  isActive: false,
  spaceCount: 12,
  rentableSpaceCount: 10,
  note: "临近地铁",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

const building = {
  id: "building-a",
  propertyId: detail.id,
  parentId: null,
  name: "A 座",
  code: null,
  type: "building" as const,
  customTypeName: null,
  isRentable: false,
  isActive: true,
  isEffectivelyActive: true,
  sortOrder: 0,
  hasChildren: true,
};

const inactiveRoom = {
  id: "room-101",
  propertyId: detail.id,
  parentId: "building-a",
  name: "101",
  code: "A-101",
  type: "room" as const,
  customTypeName: null,
  isRentable: true,
  isActive: true,
  isEffectivelyActive: false,
  sortOrder: 0,
  hasChildren: false,
};

function renderPage(
  api: Pick<RentalApi, "getProperty"> & Partial<RentalApi>,
  permissions: string[] = [],
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PropertyDetailPage
        api={{
          ...api,
          listProperties: api.listProperties ?? vi.fn(),
          createProperty: api.createProperty ?? vi.fn(),
          updateProperty: api.updateProperty ?? vi.fn(),
          setPropertyStatus: api.setPropertyStatus ?? vi.fn(),
          deleteProperty: api.deleteProperty ?? vi.fn(),
          listChildren:
            api.listChildren ??
            vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
          searchSpaces:
            api.searchSpaces ??
            vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
          createSpace: api.createSpace ?? vi.fn(),
          batchCreateSpaces: api.batchCreateSpaces ?? vi.fn(),
          updateSpace: api.updateSpace ?? vi.fn(),
          moveSpace: api.moveSpace ?? vi.fn(),
          setSpaceStatus: api.setSpaceStatus ?? vi.fn(),
          deleteSpace: api.deleteSpace ?? vi.fn(),
        }}
        organizationId="org-a"
        permissions={permissions as never}
        propertyId={detail.id}
      />
    </QueryClientProvider>,
  );
}

describe("PropertyDetailPage", () => {
  it("shows loading and an independently useful property header without ledger leakage", async () => {
    let resolve: ((value: RentalPropertyDetail) => void) | undefined;
    renderPage({
      getProperty: vi.fn(
        () =>
          new Promise<RentalPropertyDetail>((done) => {
            resolve = done;
          }),
      ),
    });
    expect(screen.getByText("正在加载房产详情...")).toBeInTheDocument();
    resolve?.(detail);
    expect(await screen.findByRole("heading", { name: "阳光公寓" })).toBeInTheDocument();
    expect(screen.getByText("停用")).toBeInTheDocument();
    expect(screen.getByText(/广东省 深圳市 南山区 科技园路 88 号/)).toBeInTheDocument();
    expect(screen.queryByText(detail.ledgerId)).not.toBeInTheDocument();
  });

  it("distinguishes missing and failed property detail responses", async () => {
    renderPage({
      getProperty: vi.fn().mockRejectedValue(new ApiError(404, "NOT_FOUND", "missing")),
    });
    expect(await screen.findByText("房产不存在或已被删除。")).toBeInTheDocument();
    renderPage({ getProperty: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await screen.findByRole("alert")).toHaveTextContent("加载房产详情失败");
  });

  it("loads only the root page initially, lazily expands a branch, and retries a failed child page", async () => {
    const user = userEvent.setup();
    const listChildren = vi
      .fn()
      .mockResolvedValueOnce({ items: [building], total: 1, page: 1, pageSize: 50 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [inactiveRoom], total: 1, page: 1, pageSize: 50 });
    renderPage({
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren,
      searchSpaces: vi.fn(),
    });

    expect(await screen.findByText("A 座")).toBeInTheDocument();
    expect(listChildren).toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: null,
      page: 1,
      pageSize: 50,
    });
    await user.click(screen.getByRole("button", { name: "展开 A 座" }));
    expect(await screen.findByText("加载子空间失败")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试加载 A 座 的子空间" }));
    expect(await screen.findByText("101")).toBeInTheDocument();
    expect(screen.getByText("因上级停用而不可用")).toBeInTheDocument();
    expect(screen.getByText("可出租")).toBeInTheDocument();
  });

  it("uses only the searched branch to expand ancestors and focuses the target row", async () => {
    const user = userEvent.setup();
    const branchB = { ...building, id: "building-b", name: "B 座" };
    const target = { ...inactiveRoom, id: "room-b-101", parentId: "building-b", name: "B-101" };
    const listChildren = vi
      .fn()
      .mockImplementation(({ parentId }: { parentId?: string | null }) => {
        if (parentId === null)
          return Promise.resolve({ items: [building, branchB], total: 2, page: 1, pageSize: 50 });
        if (parentId === "building-b")
          return Promise.resolve({ items: [target], total: 1, page: 1, pageSize: 50 });
        return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50 });
      });
    renderPage({
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren,
      searchSpaces: vi.fn().mockResolvedValue({
        items: [
          {
            ...target,
            path: [
              { id: "building-b", name: "B 座" },
              { id: "room-b-101", name: "B-101" },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    });

    await screen.findByText("A 座");
    await user.type(screen.getByLabelText("搜索空间"), "B-101");
    expect(await screen.findByRole("button", { name: /B-101/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /B-101/ }));
    await waitFor(() => expect(screen.getByRole("row", { name: /B-101/ })).toHaveFocus());
    expect(listChildren).toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: "building-b",
      page: 1,
      pageSize: 50,
    });
    expect(listChildren).not.toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: "building-a",
      page: 1,
      pageSize: 50,
    });
    expect(screen.getByRole("status")).toHaveTextContent("已定位到 B-101");
  });

  it("loads more root siblings without expanding any branch", async () => {
    const user = userEvent.setup();
    const buildingB = { ...building, id: "building-b", name: "B 座" };
    const listChildren = vi
      .fn()
      .mockResolvedValueOnce({ items: [building], total: 2, page: 1, pageSize: 50 })
      .mockResolvedValueOnce({ items: [buildingB], total: 2, page: 2, pageSize: 50 });
    renderPage({
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren,
      searchSpaces: vi.fn(),
    });

    expect(await screen.findByText("A 座")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "加载更多根空间" }));
    expect(await screen.findByText("B 座")).toBeInTheDocument();
    expect(listChildren).toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: null,
      page: 2,
      pageSize: 50,
    });
  });

  it("keeps root load failures recoverable before rendering the tree", async () => {
    const user = userEvent.setup();
    const listChildren = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [building], total: 1, page: 1, pageSize: 50 });
    renderPage({
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren,
      searchSpaces: vi.fn(),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("加载空间失败");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("A 座")).toBeInTheDocument();
  });

  it("pages through only the required root branch before locating a search target", async () => {
    const user = userEvent.setup();
    const buildingB = { ...building, id: "building-b", name: "B 座" };
    const target = { ...inactiveRoom, id: "room-b-101", parentId: "building-b", name: "B-101" };
    const listChildren = vi
      .fn()
      .mockImplementation(({ parentId, page }: { parentId?: string | null; page: number }) => {
        if (parentId === null && page === 1)
          return Promise.resolve({ items: [building], total: 2, page: 1, pageSize: 50 });
        if (parentId === null && page === 2)
          return Promise.resolve({ items: [buildingB], total: 2, page: 2, pageSize: 50 });
        if (parentId === "building-b")
          return Promise.resolve({ items: [target], total: 1, page: 1, pageSize: 50 });
        return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50 });
      });
    renderPage({
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren,
      searchSpaces: vi.fn().mockResolvedValue({
        items: [
          {
            ...target,
            path: [
              { id: "building-b", name: "B 座" },
              { id: target.id, name: target.name },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    });

    await screen.findByText("A 座");
    await user.type(screen.getByLabelText("搜索空间"), "B-101");
    await user.click(await screen.findByRole("button", { name: /B-101/ }));
    await waitFor(() => expect(screen.getByRole("row", { name: /B-101/ })).toHaveFocus());
    expect(listChildren).toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: null,
      page: 2,
      pageSize: 50,
    });
    expect(listChildren).not.toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: "building-a",
      page: 1,
      pageSize: 50,
    });
  });

  it("stops failed ancestor pagination, announces the failure, and retries only when requested", async () => {
    const user = userEvent.setup();
    const buildingB = { ...building, id: "building-b", name: "B 座" };
    const target = { ...inactiveRoom, id: "room-b-101", parentId: "building-b", name: "B-101" };
    const listChildren = vi
      .fn()
      .mockResolvedValueOnce({ items: [building], total: 2, page: 1, pageSize: 50 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [buildingB], total: 2, page: 2, pageSize: 50 })
      .mockResolvedValueOnce({ items: [target], total: 1, page: 1, pageSize: 50 });
    renderPage({
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren,
      searchSpaces: vi.fn().mockResolvedValue({
        items: [
          {
            ...target,
            path: [
              { id: "building-b", name: "B 座" },
              { id: target.id, name: target.name },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    });

    await screen.findByText("A 座");
    await user.type(screen.getByLabelText("搜索空间"), "B-101");
    await user.click(await screen.findByRole("button", { name: /B-101/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("定位空间失败");
    expect(listChildren).not.toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: "building-b",
      page: 1,
      pageSize: 50,
    });
    await user.click(screen.getByRole("button", { name: "重试定位 B-101" }));
    await waitFor(() => expect(screen.getByRole("row", { name: /B-101/ })).toHaveFocus());
  });

  it("announces in-progress search positioning before the target page resolves", async () => {
    const user = userEvent.setup();
    const target = { ...inactiveRoom, id: "room-b-101", parentId: "building-b", name: "B-101" };
    let resolveTarget:
      | ((value: {
          items: (typeof target)[];
          total: number;
          page: number;
          pageSize: number;
        }) => void)
      | undefined;
    const listChildren = vi
      .fn()
      .mockImplementation(({ parentId }: { parentId?: string | null }) => {
        if (parentId === null)
          return Promise.resolve({
            items: [{ ...building, id: "building-b", name: "B 座" }],
            total: 1,
            page: 1,
            pageSize: 50,
          });
        return new Promise((resolve) => {
          resolveTarget = resolve;
        });
      });
    renderPage({
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren,
      searchSpaces: vi.fn().mockResolvedValue({
        items: [
          {
            ...target,
            path: [
              { id: "building-b", name: "B 座" },
              { id: target.id, name: target.name },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    });

    await screen.findByText("B 座");
    await user.type(screen.getByLabelText("搜索空间"), "B-101");
    await user.click(await screen.findByRole("button", { name: /B-101/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("正在定位空间 B-101");
    resolveTarget?.({ items: [target], total: 1, page: 1, pageSize: 50 });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已定位到 B-101"));
  });

  it("hides all write actions without permission and blocks create and batch actions for an inactive property", async () => {
    const api = {
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      searchSpaces: vi.fn(),
    };
    const first = renderPage(api);
    await screen.findByRole("heading", { name: "阳光公寓" });
    expect(screen.queryByRole("button", { name: "新增空间" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批量新增" })).not.toBeInTheDocument();
    first.unmount();
    renderPage(api, ["rental_spaces:create"]);
    await screen.findByRole("heading", { name: "阳光公寓" });
    expect(screen.queryByRole("button", { name: "新增空间" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批量新增" })).not.toBeInTheDocument();
  });

  it("keeps the narrow-screen details sheet available to read-only users", async () => {
    const user = userEvent.setup();
    renderPage({
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren: vi
        .fn()
        .mockResolvedValue({ items: [building], total: 1, page: 1, pageSize: 50 }),
      searchSpaces: vi.fn(),
    });
    await screen.findByText("A 座");
    await user.click(screen.getByRole("button", { name: "详情" }));
    expect(screen.getByText("类型：building")).toBeInTheDocument();
    expect(screen.getByText("状态：自身启用")).toBeInTheDocument();
    expect(screen.getAllByText("不可出租")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "编辑 A 座" })).not.toBeInTheDocument();
  });

  it("keeps first-stage space forms free of rent fields and preserves batch text after atomic failure", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    renderPage(
      {
        getProperty: vi.fn().mockResolvedValue(activeDetail),
        listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
        searchSpaces: vi.fn(),
        batchCreateSpaces: vi.fn().mockRejectedValue(new Error("conflict")),
      },
      ["rental_spaces:create"],
    );
    await user.click(await screen.findByRole("button", { name: "新增空间" }));
    expect(screen.queryByLabelText("面积")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("租金")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("押金")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("计费周期")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: "批量新增" }));
    const lines = screen.getByRole("textbox", { name: "空间列表" });
    await user.type(lines, "101,一号房\n102,一号房");
    expect(screen.getByText("第 2 行：名称与第 1 行重复")).toBeInTheDocument();
    await user.clear(lines);
    await user.type(lines, "101,一号房");
    await user.click(screen.getByRole("button", { name: "原子创建 1 个空间" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("批量创建失败，未创建任何空间");
    expect(screen.getByRole("textbox", { name: "空间列表" })).toHaveValue("101,一号房");
  });

  it("confirms deletion and explains a 409 conflict without removing the space", async () => {
    const user = userEvent.setup();
    renderPage(
      {
        getProperty: vi.fn().mockResolvedValue(detail),
        listChildren: vi
          .fn()
          .mockResolvedValue({ items: [building], total: 1, page: 1, pageSize: 50 }),
        searchSpaces: vi.fn(),
        deleteSpace: vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", "linked")),
      },
      ["rental_spaces:delete"],
    );
    expect(await screen.findByText("A 座")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "删除 A 座" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "删除前请确保该空间没有子空间或租赁关联",
    );
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "该空间仍有子空间或租赁关联，请先处理关联后再删除。",
    );
    expect(screen.getByText("A 座")).toBeInTheDocument();
  });

  it("replaces loaded tree branches after a successful delete without collapsing unrelated branches", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    const other = { ...building, id: "building-b", name: "B 座" };
    const otherRoom = {
      ...inactiveRoom,
      id: "room-b",
      parentId: other.id,
      name: "B-101",
      isEffectivelyActive: true,
    };
    let rootItems = [building, other];
    renderPage(
      {
        getProperty: vi.fn().mockResolvedValue(activeDetail),
        listChildren: vi.fn().mockImplementation(({ parentId }: { parentId: string | null }) =>
          Promise.resolve({
            items: parentId === null ? rootItems : parentId === other.id ? [otherRoom] : [],
            total: parentId === null ? rootItems.length : parentId === other.id ? 1 : 0,
            page: 1,
            pageSize: 50,
          }),
        ),
        searchSpaces: vi.fn(),
        deleteSpace: vi.fn().mockImplementation(async () => {
          rootItems = [other];
        }),
      },
      ["rental_spaces:delete"],
    );
    await screen.findByText("A 座");
    await user.click(screen.getByRole("button", { name: "展开 B 座" }));
    await screen.findByText("B-101");
    await user.click(screen.getByRole("button", { name: "删除 A 座" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(screen.queryByText("A 座")).not.toBeInTheDocument());
    expect(screen.getByText("B 座")).toBeInTheDocument();
    expect(screen.getByText("B-101")).toBeInTheDocument();
  });

  it("refreshes the current root branch after a successful create", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    const created = { ...building, id: "building-new", name: "新楼栋", hasChildren: false };
    let rootItems = [building];
    renderPage(
      {
        getProperty: vi.fn().mockResolvedValue(activeDetail),
        listChildren: vi.fn().mockImplementation(({ parentId }: { parentId: string | null }) =>
          Promise.resolve({
            items: parentId === null ? rootItems : [],
            total: parentId === null ? rootItems.length : 0,
            page: 1,
            pageSize: 50,
          }),
        ),
        searchSpaces: vi.fn(),
        createSpace: vi.fn().mockImplementation(async () => {
          rootItems = [building, created];
          return { id: created.id };
        }),
      },
      ["rental_spaces:create"],
    );
    await user.click(await screen.findByRole("button", { name: "新增空间" }));
    await user.type(screen.getByRole("textbox", { name: "名称" }), created.name);
    await user.click(screen.getByRole("button", { name: "创建空间" }));
    expect(await screen.findByText(created.name)).toBeInTheDocument();
  });

  it("keeps a successful create successful when the follow-up tree refresh fails", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    let calls = 0;
    renderPage(
      {
        getProperty: vi.fn().mockResolvedValue(activeDetail),
        listChildren: vi.fn().mockImplementation(() => {
          calls += 1;
          return calls === 1
            ? Promise.resolve({ items: [building], total: 1, page: 1, pageSize: 50 })
            : Promise.reject(new Error("refresh unavailable"));
        }),
        searchSpaces: vi.fn(),
        createSpace: vi.fn().mockResolvedValue({ id: "created" }),
      },
      ["rental_spaces:create"],
    );
    await user.click(await screen.findByRole("button", { name: "新增空间" }));
    await user.type(screen.getByRole("textbox", { name: "名称" }), "新空间");
    await user.click(screen.getByRole("button", { name: "创建空间" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => alert.textContent?.includes("创建已成功，但树刷新失败")),
    ).toBe(true);
  });

  it("requires explicit confirmation before changing status and explains the descendant impact", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    const setSpaceStatus = vi.fn().mockResolvedValue({ id: building.id });
    renderPage(
      {
        getProperty: vi.fn().mockResolvedValue(activeDetail),
        listChildren: vi
          .fn()
          .mockResolvedValue({ items: [building], total: 1, page: 1, pageSize: 50 }),
        searchSpaces: vi.fn(),
        setSpaceStatus,
      },
      ["rental_spaces:update"],
    );
    await screen.findByText("A 座");
    await user.click(screen.getByRole("button", { name: "停用 A 座" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("已启用后代会因上级停用而暂时不可用");
    expect(setSpaceStatus).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(setSpaceStatus).toHaveBeenCalledWith(building.id, false));
  });

  it("opens move targets from only the root page and loads more roots on request", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    const source = { ...inactiveRoom, isEffectivelyActive: true };
    const targetBranch = { ...building, id: "building-b", name: "B 座" };
    const nestedTarget = {
      ...source,
      id: "unit-b",
      parentId: "building-b",
      name: "B 单元",
      type: "unit" as const,
    };
    const rootPageOne = [
      building,
      targetBranch,
      ...Array.from({ length: 48 }, (_, index) => ({
        ...building,
        id: `root-${index}`,
        name: `根 ${index}`,
        hasChildren: false,
      })),
    ];
    const listChildren = vi
      .fn()
      .mockImplementation(({ parentId, page }: { parentId: string | null; page: number }) => {
        if (parentId === null)
          return Promise.resolve({
            items: page === 1 ? rootPageOne : [{ ...building, id: "root-51", name: "第 51 个" }],
            total: 51,
            page,
            pageSize: 50,
          });
        if (parentId === building.id)
          return Promise.resolve({ items: [source], total: 1, page, pageSize: 50 });
        if (parentId === targetBranch.id)
          return Promise.resolve({ items: [nestedTarget], total: 1, page, pageSize: 50 });
        return Promise.resolve({ items: [], total: 0, page, pageSize: 50 });
      });
    renderPage(
      { getProperty: vi.fn().mockResolvedValue(activeDetail), listChildren, searchSpaces: vi.fn() },
      ["rental_spaces:update"],
    );
    await screen.findByText("A 座");
    await user.click(screen.getByRole("button", { name: "展开 A 座" }));
    await screen.findByText("101");
    await user.click(screen.getByRole("button", { name: "移动 101" }));
    expect(await screen.findByRole("button", { name: "加载更多可移动根空间" })).toBeInTheDocument();
    expect(listChildren).not.toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: targetBranch.id,
      page: 1,
      pageSize: 50,
    });
    await user.click(screen.getByRole("button", { name: "加载更多可移动根空间" }));
    expect(listChildren).toHaveBeenLastCalledWith({
      propertyId: detail.id,
      parentId: null,
      page: 2,
      pageSize: 50,
    });
    expect(await screen.findByRole("button", { name: "选择 第 51 个" })).toBeInTheDocument();
    expect(listChildren).toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: null,
      page: 2,
      pageSize: 50,
    });
  });

  it("loads only the expanded move candidate branch and requires a nested source to select a target", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    const source = { ...inactiveRoom, isEffectivelyActive: true };
    const targetBranch = { ...building, id: "building-b", name: "B 座" };
    const nestedTarget = {
      ...source,
      id: "unit-b",
      parentId: targetBranch.id,
      name: "B 单元",
      type: "unit" as const,
    };
    const listChildren = vi
      .fn()
      .mockImplementation(({ parentId, page }: { parentId: string | null; page: number }) => {
        if (parentId === null)
          return Promise.resolve({ items: [building, targetBranch], total: 2, page, pageSize: 50 });
        if (parentId === building.id)
          return Promise.resolve({ items: [source], total: 1, page, pageSize: 50 });
        if (parentId === targetBranch.id)
          return Promise.resolve({ items: [nestedTarget], total: 1, page, pageSize: 50 });
        return Promise.resolve({ items: [], total: 0, page, pageSize: 50 });
      });
    renderPage(
      { getProperty: vi.fn().mockResolvedValue(activeDetail), listChildren, searchSpaces: vi.fn() },
      ["rental_spaces:update"],
    );
    await screen.findByText("A 座");
    await user.click(screen.getByRole("button", { name: "展开 A 座" }));
    await user.click(await screen.findByRole("button", { name: "移动 101" }));
    expect(await screen.findByText("请选择目标父级")).toBeInTheDocument();
    expect(listChildren).not.toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: targetBranch.id,
      page: 1,
      pageSize: 50,
    });
    await user.click(screen.getByRole("button", { name: "展开候选 B 座" }));
    expect(await screen.findByRole("button", { name: "选择 B 单元" })).toBeInTheDocument();
    expect(listChildren).toHaveBeenCalledWith({
      propertyId: detail.id,
      parentId: targetBranch.id,
      page: 1,
      pageSize: 50,
    });
    await user.click(screen.getByRole("button", { name: "选择 B 单元" }));
    expect(screen.getByRole("button", { name: "确认移动" })).toBeEnabled();
  });

  it("shows the source descendants as disabled move targets after lazy expansion", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    const source = {
      ...inactiveRoom,
      hasChildren: true,
      parentId: null,
      isEffectivelyActive: true,
    };
    const sourceChild = {
      ...source,
      id: "room-101-child",
      parentId: source.id,
      name: "101 子空间",
      hasChildren: false,
    };
    const listChildren = vi
      .fn()
      .mockImplementation(({ parentId, page }: { parentId: string | null; page: number }) => {
        const items =
          parentId === null ? [source, building] : parentId === source.id ? [sourceChild] : [];
        return Promise.resolve({ items, total: items.length, page, pageSize: 50 });
      });
    renderPage(
      { getProperty: vi.fn().mockResolvedValue(activeDetail), listChildren, searchSpaces: vi.fn() },
      ["rental_spaces:update"],
    );
    await screen.findByText("A 座");
    await screen.findByText("101");
    await user.click(screen.getByRole("button", { name: "移动 101" }));
    await user.click(screen.getByRole("button", { name: "展开候选 101" }));
    expect(await screen.findByText("101（当前空间，不可作为目标）")).toBeInTheDocument();
    expect(
      await screen.findByText("101 子空间（当前空间的后代，不可作为目标）"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择 101 子空间" })).not.toBeInTheDocument();
  });

  it("does not offer a fourth-level target parent when moving a leaf", async () => {
    const user = userEvent.setup();
    const activeDetail = { ...detail, isActive: true };
    const source = { ...inactiveRoom, id: "source", parentId: null, isEffectivelyActive: true };
    const levelOne = { ...building, id: "l1", name: "L1" };
    const levelTwo = { ...building, id: "l2", parentId: levelOne.id, name: "L2" };
    const levelThree = { ...building, id: "l3", parentId: levelTwo.id, name: "L3" };
    const levelFour = {
      ...building,
      id: "l4",
      parentId: levelThree.id,
      name: "L4",
      hasChildren: false,
    };
    const listChildren = vi
      .fn()
      .mockImplementation(({ parentId, page }: { parentId: string | null; page: number }) => {
        const items =
          parentId === null
            ? [source, levelOne]
            : parentId === levelOne.id
              ? [levelTwo]
              : parentId === levelTwo.id
                ? [levelThree]
                : parentId === levelThree.id
                  ? [levelFour]
                  : [];
        return Promise.resolve({ items, total: items.length, page, pageSize: 50 });
      });
    renderPage(
      { getProperty: vi.fn().mockResolvedValue(activeDetail), listChildren, searchSpaces: vi.fn() },
      ["rental_spaces:update"],
    );
    await screen.findByText("101");
    await user.click(screen.getByRole("button", { name: "移动 101" }));
    await user.click(screen.getByRole("button", { name: "展开候选 L1" }));
    await user.click(await screen.findByRole("button", { name: "展开候选 L2" }));
    await user.click(await screen.findByRole("button", { name: "展开候选 L3" }));
    expect(listChildren).toHaveBeenLastCalledWith({
      propertyId: detail.id,
      parentId: levelThree.id,
      page: 1,
      pageSize: 50,
    });
    expect(await screen.findByText("L4（层级超限）")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择 L4" })).not.toBeInTheDocument();
  });
});
