import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  PermissionKey,
  RentalPropertyDetail,
  RentalPropertyPage,
  RentalPropertySummary,
} from "@xpense/shared";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../services/api-client";
import type { ListRentalPropertiesQuery, RentalApi } from "../../../services/rental-api";
import { rentalKeys, rentalQueryOptions } from "../../../services/rental-query";
import { PropertiesPage } from "./properties-page";

const property: RentalPropertySummary = {
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
  isActive: true,
  spaceCount: 12,
  rentableSpaceCount: 10,
  updatedAt: "2026-08-26T00:00:00.000Z",
};

function page(items: RentalPropertySummary[] = [property]): RentalPropertyPage {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

const propertyWithNote: RentalPropertyDetail = {
  ...property,
  note: "保留的原始备注",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function createApi(overrides: Partial<RentalApi> = {}): RentalApi {
  return {
    listProperties: vi.fn().mockResolvedValue(page()),
    getProperty: vi.fn(),
    createProperty: vi
      .fn()
      .mockResolvedValue({ ...property, note: null, createdAt: property.updatedAt }),
    updateProperty: vi
      .fn()
      .mockResolvedValue({ ...property, note: null, createdAt: property.updatedAt }),
    setPropertyStatus: vi
      .fn()
      .mockResolvedValue({ ...property, note: null, createdAt: property.updatedAt }),
    deleteProperty: vi.fn().mockResolvedValue(undefined),
    listChildren: vi.fn(),
    searchSpaces: vi.fn(),
    createSpace: vi.fn(),
    batchCreateSpaces: vi.fn(),
    updateSpace: vi.fn(),
    moveSpace: vi.fn(),
    setSpaceStatus: vi.fn(),
    deleteSpace: vi.fn(),
    ...overrides,
  };
}

function renderPage({
  api = createApi(),
  initialSearch = {},
  permissions = ["rental_properties:read"] as readonly PermissionKey[],
  onSearchChange,
  onNavigate = () => undefined,
}: {
  api?: RentalApi;
  initialSearch?: ListRentalPropertiesQuery;
  permissions?: readonly PermissionKey[];
  onSearchChange?: (value: ListRentalPropertiesQuery) => void;
  onNavigate?: (propertyId: string) => void;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [search, setSearch] = useState(initialSearch);
    return (
      <PropertiesPage
        api={api}
        organizationId="org-a"
        permissions={permissions}
        search={search}
        onNavigate={onNavigate}
        onSearchChange={(next) => {
          onSearchChange?.(next);
          setSearch(next);
        }}
      />
    );
  }
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    ),
  };
}

describe("PropertiesPage", () => {
  it("normalizes URL-scoped filters, resets paging, and sends them to the list API", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listProperties: vi.fn(async (query = {}) => ({
        ...page(),
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      })),
    });
    const onSearchChange = vi.fn();
    renderPage({
      api,
      initialSearch: { keyword: "  阳光 ", page: 2, pageSize: 50 },
      onSearchChange,
    });
    expect(await screen.findByText("阳光公寓")).toBeInTheDocument();
    expect(api.listProperties).toHaveBeenCalledWith({ keyword: "阳光", page: 2, pageSize: 50 });
    await user.clear(screen.getByRole("textbox", { name: "关键词" }));
    await user.type(screen.getByRole("textbox", { name: "关键词" }), "  花园  ");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    expect(onSearchChange).toHaveBeenLastCalledWith({
      keyword: "花园",
      page: undefined,
      pageSize: 50,
    });
  });

  it("renders loading, empty, and server failure states", async () => {
    let resolve: ((value: RentalPropertyPage) => void) | undefined;
    const pendingApi = createApi({
      listProperties: vi.fn(
        () =>
          new Promise<RentalPropertyPage>((done) => {
            resolve = done;
          }),
      ),
    });
    renderPage({ api: pendingApi });
    expect(screen.getByText("正在加载房产...")).toBeInTheDocument();
    resolve?.(page([]));
    expect(await screen.findByText("当前没有房产。")).toBeInTheDocument();
    renderPage({
      api: createApi({ listProperties: vi.fn().mockRejectedValue(new Error("offline")) }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("加载房产失败");
  });

  it("renders desktop table without exposing ledger IDs", async () => {
    renderPage();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText(property.ledgerId)).not.toBeInTheDocument();
    expect(screen.getByText("共 12 个空间，可出租 10 个")).toBeInTheDocument();
  });

  it("renders viewer-safe, user-visible summary cards on a narrow screen", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string): MediaQueryList => ({
        matches: query === "(max-width: 767px)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      }),
    });
    renderPage();
    const cards = await screen.findByTestId("property-cards");
    expect(cards).toHaveTextContent("阳光公寓");
    expect(cards).toHaveTextContent("公寓楼");
    expect(cards).toHaveTextContent("广东省 深圳市 南山区 科技园路 88 号");
    expect(cards).toHaveTextContent("共 12 个空间，可出租 10 个");
    expect(cards).toHaveTextContent("启用");
    expect(screen.getByRole("link", { name: "阳光公寓" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑 阳光公寓" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用 阳光公寓" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 阳光公寓" })).not.toBeInTheDocument();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  });

  it("shows editable mobile card actions only to authorized users", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string): MediaQueryList => ({
        matches: query === "(max-width: 767px)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      }),
    });
    renderPage({
      permissions: [
        "rental_properties:read",
        "rental_properties:update",
        "rental_properties:delete",
      ],
    });
    await screen.findByTestId("property-cards");
    expect(screen.getByRole("button", { name: "编辑 阳光公寓" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停用 阳光公寓" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 阳光公寓" })).toBeInTheDocument();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  });

  it("preserves an existing note when an edit changes only the name", async () => {
    const user = userEvent.setup();
    let stored = propertyWithNote;
    const api = createApi({
      updateProperty: vi.fn(async (input) => {
        stored = { ...stored, ...input };
        return stored;
      }),
      getProperty: vi.fn(async () => stored),
    });
    renderPage({ api, permissions: ["rental_properties:read", "rental_properties:update"] });
    await screen.findByText("阳光公寓");
    await user.click(screen.getByRole("button", { name: "编辑 阳光公寓" }));
    const name = screen.getByRole("textbox", { name: "房产名称" });
    await user.clear(name);
    await user.type(name, "阳光公寓二期");
    await user.click(screen.getByRole("button", { name: "保存房产" }));
    await waitFor(() => expect(api.updateProperty).toHaveBeenCalledOnce());
    expect(api.updateProperty).toHaveBeenCalledWith({ id: property.id, name: "阳光公寓二期" });
    expect((await api.getProperty(property.id)).note).toBe("保留的原始备注");
  });

  it("removes the exact property detail cache after deletion so a later read observes 404", async () => {
    const user = userEvent.setup();
    const api = createApi({
      getProperty: vi.fn().mockRejectedValue(new ApiError(404, "NOT_FOUND", "missing")),
    });
    const { queryClient } = renderPage({
      api,
      permissions: ["rental_properties:read", "rental_properties:delete"],
    });
    queryClient.setQueryData(rentalKeys.property("org-a", property.id), propertyWithNote);
    await screen.findByText("阳光公寓");
    await user.click(screen.getByRole("button", { name: "删除 阳光公寓" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(api.deleteProperty).toHaveBeenCalledWith(property.id));
    expect(queryClient.getQueryData(rentalKeys.property("org-a", property.id))).toBeUndefined();
    await expect(
      queryClient.fetchQuery(rentalQueryOptions.property(api, "org-a", property.id)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("creates, updates, toggles status, and deletes only after server success", async () => {
    const user = userEvent.setup();
    const api = createApi();
    renderPage({
      api,
      permissions: [
        "rental_properties:read",
        "rental_properties:create",
        "rental_properties:update",
        "rental_properties:delete",
      ],
    });
    await screen.findByText("阳光公寓");
    await user.click(screen.getByRole("button", { name: "新增房产" }));
    await user.type(screen.getByRole("textbox", { name: "房产名称" }), "新房产");
    await user.type(screen.getByRole("textbox", { name: "详细地址" }), "测试路 1 号");
    await user.click(screen.getByRole("button", { name: "创建房产" }));
    await waitFor(() =>
      expect(api.createProperty).toHaveBeenCalledWith(
        expect.objectContaining({ name: "新房产", addressLine: "测试路 1 号" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "编辑 阳光公寓" }));
    const name = screen.getByRole("textbox", { name: "房产名称" });
    await user.clear(name);
    await user.type(name, "阳光公寓二期");
    await user.click(screen.getByRole("button", { name: "保存房产" }));
    await waitFor(() =>
      expect(api.updateProperty).toHaveBeenCalledWith(
        expect.objectContaining({ id: property.id, name: "阳光公寓二期" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "停用 阳光公寓" }));
    await waitFor(() =>
      expect(api.setPropertyStatus).toHaveBeenCalledWith({ id: property.id, isActive: false }),
    );
    await user.click(screen.getByRole("button", { name: "删除 阳光公寓" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(api.deleteProperty).toHaveBeenCalledWith(property.id));
  });

  it("keeps a conflicted row and gives deactivation guidance", async () => {
    const user = userEvent.setup();
    const api = createApi({
      deleteProperty: vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", "in use")),
    });
    renderPage({ api, permissions: ["rental_properties:read", "rental_properties:delete"] });
    await screen.findByText("阳光公寓");
    await user.click(screen.getByRole("button", { name: "删除 阳光公寓" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "该房产存在空间或账务关联，请改为停用",
    );
    expect(screen.getByText("阳光公寓")).toBeInTheDocument();
  });

  it("hides write actions for a viewer and navigates through the property name", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderPage({ onNavigate: navigate });
    await screen.findByText("阳光公寓");
    expect(screen.queryByRole("button", { name: "新增房产" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑 阳光公寓" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "阳光公寓" }));
    expect(navigate).toHaveBeenCalledWith(property.id);
  });
});
