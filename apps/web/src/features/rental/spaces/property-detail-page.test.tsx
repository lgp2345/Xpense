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
  api: Pick<RentalApi, "getProperty"> & Partial<Pick<RentalApi, "listChildren" | "searchSpaces">>,
  permissions: string[] = [],
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PropertyDetailPage
        api={{
          ...api,
          listChildren:
            api.listChildren ??
            vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
          searchSpaces:
            api.searchSpaces ??
            vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
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
  });

  it("only exposes the future space-maintenance entry to members with write permission", async () => {
    const api = {
      getProperty: vi.fn().mockResolvedValue(detail),
      listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      searchSpaces: vi.fn(),
    };
    const first = renderPage(api);
    await screen.findByRole("heading", { name: "阳光公寓" });
    expect(screen.queryByText("已具备空间维护权限")).not.toBeInTheDocument();
    first.unmount();
    renderPage(api, ["rental_spaces:create"]);
    expect(await screen.findByText("已具备空间维护权限")).toBeInTheDocument();
  });
});
