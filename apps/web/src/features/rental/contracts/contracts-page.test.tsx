import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey, RentalContractPage, RentalContractSummary } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../services/api-client";
import type { ListRentalContractsQuery, RentalApi } from "../../../services/rental-api";
import { ContractsPage } from "./contracts-page";

const contract: RentalContractSummary = {
  id: "contract-1",
  propertyId: "property-1",
  propertyName: "阳光公寓",
  contractNumber: "RC-2026-000001",
  externalContractNumber: "EXT-001",
  lifecycleStatus: "confirmed",
  displayStatus: "active",
  startDate: "2026-08-01",
  endDate: "2027-07-31",
  actualEndDate: null,
  rentAmountMinor: 800000,
  tenantNames: ["张三"],
  spaceNames: ["101"],
  updatedAt: "2026-08-30T00:00:00.000Z",
};

function createApi(overrides: Partial<RentalApi> = {}): RentalApi {
  return {
    listContracts: vi.fn().mockResolvedValue({
      items: [contract],
      total: 1,
      page: 1,
      pageSize: 20,
    } satisfies RentalContractPage),
    contractDetail: vi.fn(),
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
  permissions = ["rental_contracts:read"] as readonly PermissionKey[],
  search = {
    keyword: "  RC-2026  ",
    status: "active" as const,
    startDateFrom: "2026-08-01",
    page: 2,
    pageSize: 20,
  },
  onSearchChange = vi.fn(),
  onNavigate = vi.fn(),
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}: {
  api?: RentalApi;
  permissions?: readonly PermissionKey[];
  search?: ListRentalContractsQuery;
  onSearchChange?: (search: ListRentalContractsQuery) => void;
  onNavigate?: (contractId: string) => void;
  queryClient?: QueryClient;
} = {}) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ContractsPage
          api={api}
          organizationId="org-a"
          permissions={permissions}
          search={search}
          onSearchChange={onSearchChange}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("ContractsPage", () => {
  it("passes one normalized URL search to the list API and displays the server status", async () => {
    const api = createApi();
    renderPage({ api });

    expect(await screen.findByRole("heading", { name: "合同管理" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "RC-2026-000001" })).toBeInTheDocument();
    expect(api.listContracts).toHaveBeenCalledWith({
      keyword: "RC-2026",
      status: "active",
      startDateFrom: "2026-08-01",
      page: 2,
      pageSize: 20,
    });
    expect(screen.getAllByText("进行中").length).toBeGreaterThan(0);
  });

  it("resets page when filters apply and preserves filters when paging", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderPage({
      onSearchChange,
      api: createApi({
        listContracts: vi
          .fn()
          .mockResolvedValue({ items: [contract], total: 41, page: 2, pageSize: 20 }),
      }),
    });

    await screen.findByRole("link", { name: "RC-2026-000001" });
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: "RC-2026", page: 1, pageSize: 20 }),
    );

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: "RC-2026", status: "active", page: 3, pageSize: 20 }),
    );
  });

  it("passes property and tenant filters from the form", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderPage({ onSearchChange });

    await screen.findByRole("link", { name: "RC-2026-000001" });
    await user.type(screen.getByLabelText("房产"), "property-2");
    await user.type(screen.getByLabelText("租户"), "tenant-2");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ propertyId: "property-2", tenantId: "tenant-2", page: 1 }),
    );
  });

  it("does not query without read permission", () => {
    const api = createApi();
    renderPage({ api, permissions: [] });
    expect(screen.getByText("你没有查看合同的权限。")).toBeInTheDocument();
    expect(api.listContracts).not.toHaveBeenCalled();
  });

  it("offers retry for list failures", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listContracts: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce({ items: [contract], total: 1, page: 1, pageSize: 20 }),
    });
    renderPage({ api });

    expect(await screen.findByRole("alert")).toHaveTextContent("加载合同失败");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("link", { name: "RC-2026-000001" })).toBeInTheDocument();
    expect(api.listContracts).toHaveBeenCalledTimes(2);
  });

  it("hides stale list data when a background refresh becomes forbidden", async () => {
    const page: RentalContractPage = { items: [contract], total: 41, page: 2, pageSize: 20 };
    const api = createApi({
      listContracts: vi
        .fn()
        .mockResolvedValueOnce(page)
        .mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "forbidden")),
    });
    const { queryClient } = renderPage({ api });
    expect(await screen.findByRole("link", { name: "RC-2026-000001" })).toBeInTheDocument();
    await queryClient.refetchQueries({ queryKey: ["rental", "org-a", "contracts"] });
    expect(await screen.findByText("你没有查看合同的权限。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "RC-2026-000001" })).not.toBeInTheDocument();
    expect(screen.queryByText("第 2 页，共 41 个合同")).not.toBeInTheDocument();
  });

  it("renders every server display status label without deriving lifecycle from browser time", async () => {
    const statuses = [
      "draft",
      "upcoming",
      "active",
      "expiring_soon",
      "expired",
      "cancelled",
      "terminated",
    ] as const;
    const api = createApi({
      listContracts: vi.fn().mockResolvedValue({
        items: statuses.map((displayStatus, index) => ({
          ...contract,
          id: `contract-${index}`,
          contractNumber: `RC-${index}`,
          displayStatus,
        })),
        total: statuses.length,
        page: 1,
        pageSize: 20,
      }),
    });
    renderPage({ api, search: { page: 1, pageSize: 20 } });
    for (const label of ["草稿", "待生效", "进行中", "即将到期", "已到期", "已取消", "已终止"]) {
      expect(await screen.findAllByText(label)).not.toHaveLength(0);
    }
  });

  it("mounts only the responsive presentation that matches the viewport", async () => {
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
      expect(await screen.findByTestId("contract-cards")).toHaveTextContent("RC-2026-000001");
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("does not show a previous organization's placeholder while the next list is loading", async () => {
    const next = deferred<RentalContractPage>();
    const api = createApi({
      listContracts: vi
        .fn()
        .mockResolvedValueOnce({ items: [contract], total: 1, page: 1, pageSize: 20 })
        .mockReturnValueOnce(next.promise),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderPage({ api, queryClient });
    expect(await screen.findByRole("link", { name: "RC-2026-000001" })).toBeInTheDocument();
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ContractsPage
          api={api}
          organizationId="org-b"
          permissions={["rental_contracts:read"]}
          search={{ page: 1, pageSize: 20 }}
          onSearchChange={vi.fn()}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("link", { name: "RC-2026-000001" })).not.toBeInTheDocument();
    expect(screen.getByText("正在加载合同...")).toBeInTheDocument();
    next.resolve({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});
