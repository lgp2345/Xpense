import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey, RentalTenantPage, RentalTenantSummary } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { TenantsPage } from "./tenants-page";

const tenant: RentalTenantSummary = {
  id: "tenant-1",
  type: "individual",
  name: "张三",
  phone: "13800000000",
  email: "zhang@example.com",
  primaryContactName: "张三",
  primaryContactPhone: "13900000000",
  documentCountryCode: "CN",
  documentType: "national_id",
  documentTypeOtherName: null,
  maskedDocumentNumber: "********0011",
  isActive: true,
  contractCount: 0,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function createApi(overrides: Partial<RentalApi> = {}): RentalApi {
  return {
    listTenants: vi.fn().mockResolvedValue({ items: [tenant], total: 1, page: 1, pageSize: 20 }),
    tenantDetail: vi.fn(),
    createTenant: vi.fn(),
    updateTenant: vi.fn(),
    setTenantStatus: vi.fn(),
    deleteTenant: vi.fn(),
    listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    ...overrides,
  } as RentalApi;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderPage({
  api = createApi(),
  permissions = ["rental_tenants:read"] as readonly PermissionKey[],
  onSearchChange = vi.fn(),
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
} = {}) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TenantsPage
          api={api}
          organizationId="org-a"
          permissions={permissions}
          search={{ keyword: "  张三  ", documentNumber: " 110101 ", page: 1, pageSize: 20 }}
          onSearchChange={onSearchChange}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("TenantsPage", () => {
  it("uses the normalized URL search for exact document-number API input and renders zero contract count", async () => {
    const api = createApi();
    renderPage({ api });
    expect(await screen.findByRole("heading", { name: "租客管理" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "张三" })).toBeInTheDocument();
    expect(api.listTenants).toHaveBeenCalledWith({
      keyword: "张三",
      documentNumber: " 110101 ",
      page: 1,
      pageSize: 20,
    });
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getByText("********0011")).toBeInTheDocument();
  });

  it("shows a safe forbidden state without querying when read permission is absent", () => {
    const api = createApi();
    renderPage({ api, permissions: [] });
    expect(screen.getByText("你没有查看租客的权限。")).toBeInTheDocument();
    expect(api.listTenants).not.toHaveBeenCalled();
  });

  it("renders a recoverable empty state", async () => {
    const page: RentalTenantPage = { items: [], total: 0, page: 1, pageSize: 20 };
    renderPage({ api: createApi({ listTenants: vi.fn().mockResolvedValue(page) }) });
    expect(await screen.findByText("当前没有匹配的租客。")).toBeInTheDocument();
  });

  it("offers retry when the list request fails", async () => {
    const user = userEvent.setup();
    const page: RentalTenantPage = { items: [tenant], total: 1, page: 1, pageSize: 20 };
    const api = createApi({
      listTenants: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page),
    });
    renderPage({ api });
    expect(await screen.findByRole("alert")).toHaveTextContent("加载租客失败");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("link", { name: "张三" })).toBeInTheDocument();
    expect(api.listTenants).toHaveBeenCalledTimes(2);
  });

  it("keeps a previous-page control when the server returns an out-of-range empty page", async () => {
    const onSearchChange = vi.fn();
    renderPage({
      api: createApi({
        listTenants: vi.fn().mockResolvedValue({ items: [], total: 1, page: 5, pageSize: 20 }),
      }),
      onSearchChange,
    });
    expect(await screen.findByText("当前没有匹配的租客。")).toBeInTheDocument();
    const previous = screen.getByRole("button", { name: "上一页" });
    expect(previous).toBeEnabled();
    await userEvent.setup().click(previous);
    expect(onSearchChange).toHaveBeenLastCalledWith({
      keyword: "张三",
      documentNumber: " 110101 ",
      page: 4,
      pageSize: 20,
    });
  });

  it("associates filter labels with native selects", () => {
    renderPage();
    expect(screen.getByLabelText("租客类型")).toHaveAttribute("id", "tenant-filter-租客类型");
    expect(screen.getByLabelText("状态")).toHaveAttribute("id", "tenant-filter-状态");
  });

  it("shows an accessible loading state before the list resolves", () => {
    const api = createApi({
      listTenants: vi.fn(() => new Promise<RentalTenantPage>(() => undefined)),
    });
    renderPage({ api });
    expect(screen.getByText("正在加载租客...")).toBeInTheDocument();
  });

  it("mounts only mobile cards on a narrow screen", async () => {
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
    try {
      renderPage();
      expect(await screen.findByTestId("tenant-cards")).toHaveTextContent("张三");
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("executes authorized status and delete mutations", async () => {
    const user = userEvent.setup();
    const api = createApi({
      setTenantStatus: vi.fn().mockResolvedValue(undefined),
      deleteTenant: vi.fn().mockResolvedValue(undefined),
    });
    renderPage({
      api,
      permissions: ["rental_tenants:read", "rental_tenants:update", "rental_tenants:delete"],
    });
    await screen.findByRole("link", { name: "张三" });
    await user.click(screen.getByRole("button", { name: "停用" }));
    await vi.waitFor(() =>
      expect(api.setTenantStatus).toHaveBeenCalledWith({ id: "tenant-1", isActive: false }),
    );
    await user.click(screen.getByRole("button", { name: "删除 张三" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await vi.waitFor(() => expect(api.deleteTenant).toHaveBeenCalledWith("tenant-1"));
  });

  it("hides stale rows when a background refresh loses read permission", async () => {
    const page: RentalTenantPage = { items: [tenant], total: 41, page: 2, pageSize: 20 };
    const api = createApi({
      listTenants: vi
        .fn()
        .mockResolvedValueOnce(page)
        .mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "forbidden")),
    });
    const { queryClient } = renderPage({ api });
    expect(await screen.findByRole("link", { name: "张三" })).toBeInTheDocument();
    expect(screen.getByText("第 2 页，共 41 个租客")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeInTheDocument();
    await queryClient.refetchQueries({ queryKey: ["rental", "org-a", "tenants"] });
    expect(await screen.findByText("你没有查看租客的权限。")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "张三" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("第 2 页，共 41 个租客")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上一页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一页" })).not.toBeInTheDocument();
  });

  it("disables pagination while a tenant mutation is pending", async () => {
    const user = userEvent.setup();
    const status = deferred<void>();
    const api = createApi({
      listTenants: vi.fn().mockResolvedValue({ items: [tenant], total: 41, page: 1, pageSize: 20 }),
      setTenantStatus: vi.fn().mockReturnValue(status.promise),
    });
    renderPage({
      api,
      permissions: ["rental_tenants:read", "rental_tenants:update"],
    });
    await screen.findByRole("link", { name: "张三" });
    await user.click(screen.getByRole("button", { name: "停用" }));
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    status.resolve();
  });
});
