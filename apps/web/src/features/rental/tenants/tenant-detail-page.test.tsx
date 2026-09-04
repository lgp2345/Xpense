import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  RentalContractPage,
  RentalTenantDetail,
  RentalTenantSensitiveDetail,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { TenantDetailPage } from "./tenant-detail-page";
import { TenantSensitivePanel } from "./tenant-sensitive-panel";

const tenant: RentalTenantDetail = {
  id: "tenant-1",
  type: "individual",
  name: "张三",
  phone: "13800000000",
  email: null,
  primaryContactName: "张三",
  primaryContactPhone: "13900000000",
  documentCountryCode: "CN",
  documentType: "national_id",
  documentTypeOtherName: null,
  maskedDocumentNumber: "********0011",
  isActive: true,
  contractCount: 0,
  updatedAt: "2026-08-01T00:00:00.000Z",
  note: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderPage(
  api: Pick<RentalApi, "tenantDetail" | "listContracts"> & Partial<RentalApi>,
  permissions: string[] = ["rental_tenants:read"],
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantDetailPage
        api={api as RentalApi}
        organizationId="org-a"
        tenantId="tenant-1"
        permissions={permissions as never}
      />
    </QueryClientProvider>,
  );
}

describe("TenantDetailPage", () => {
  it("starts tenant detail and contract history queries in parallel", async () => {
    const detail = deferred<RentalTenantDetail>();
    const history = deferred<RentalContractPage>();
    const api = {
      tenantDetail: vi.fn().mockReturnValue(detail.promise),
      listContracts: vi.fn().mockReturnValue(history.promise),
    };
    renderPage(api);
    expect(api.tenantDetail).toHaveBeenCalledWith("tenant-1");
    expect(api.listContracts).toHaveBeenCalledWith({ tenantId: "tenant-1", page: 1, pageSize: 20 });
    detail.resolve(tenant);
    history.resolve({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(await screen.findByRole("heading", { name: "张三" })).toBeInTheDocument();
  });

  it("shows masked identity by default and keeps history failure local", async () => {
    renderPage({
      tenantDetail: vi.fn().mockResolvedValue(tenant),
      listContracts: vi.fn().mockRejectedValue(new Error("offline")),
    });
    expect((await screen.findAllByText("********0011")).length).toBeGreaterThan(0);
    expect(await screen.findByText("合同历史加载失败，请重试。")).toBeInTheDocument();
    expect(screen.queryByText("110101199001010011")).not.toBeInTheDocument();
  });

  it("does not render reveal without both ordinary and sensitive permissions", async () => {
    renderPage(
      {
        tenantDetail: vi.fn().mockResolvedValue(tenant),
        listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      },
      ["rental_tenants:read"],
    );
    await screen.findAllByText("********0011");
    expect(screen.queryByRole("button", { name: "查看完整身份信息" })).not.toBeInTheDocument();
  });

  it("clears a late reveal response after close and never writes it to the query cache", async () => {
    const user = userEvent.setup();
    const reveal = deferred<RentalTenantSensitiveDetail>();
    const api = { revealTenantSensitive: vi.fn().mockReturnValue(reveal.promise) };
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TenantSensitivePanel
          api={api as unknown as RentalApi}
          organizationId="org-a"
          tenantId="tenant-1"
          maskedDocumentNumber="********0011"
          permissions={["rental_tenants:read", "rental_tenants:sensitive_read"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "查看完整身份信息" }));
    expect(api.revealTenantSensitive).toHaveBeenCalledWith(
      { id: "tenant-1" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await user.click(screen.getByRole("button", { name: "关闭完整信息" }));
    reveal.resolve({
      tenantId: "tenant-1",
      documentNumber: "110101199001010011",
      birthDate: null,
      gender: null,
      ethnicity: null,
      documentAddress: null,
    });
    await waitFor(() => expect(screen.queryByText("110101199001010011")).not.toBeInTheDocument());
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .some((query) => JSON.stringify(query.state.data).includes("110101199001010011")),
    ).toBe(false);
  });

  it("hides and invalidates a reveal immediately when sensitive permission is revoked", async () => {
    const user = userEvent.setup();
    const first = deferred<RentalTenantSensitiveDetail>();
    const second = deferred<RentalTenantSensitiveDetail>();
    const api = {
      revealTenantSensitive: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    };
    const view = render(
      <TenantSensitivePanel
        api={api as unknown as RentalApi}
        organizationId="org-a"
        tenantId="tenant-1"
        maskedDocumentNumber="********0011"
        permissions={["rental_tenants:read", "rental_tenants:sensitive_read"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看完整身份信息" }));
    const firstSignal = (
      api.revealTenantSensitive.mock.calls[0] as [object, { signal: AbortSignal }]
    )[1].signal;
    view.rerender(
      <TenantSensitivePanel
        api={api as unknown as RentalApi}
        organizationId="org-a"
        tenantId="tenant-1"
        maskedDocumentNumber="********0011"
        permissions={["rental_tenants:read"]}
      />,
    );
    expect(firstSignal.aborted).toBe(true);
    expect(screen.getByText("********0011")).toBeInTheDocument();
    expect(screen.queryByText("正在读取完整身份信息...")).not.toBeInTheDocument();
    first.resolve({
      tenantId: "tenant-1",
      documentNumber: "late-sensitive-value",
      birthDate: null,
      gender: null,
      ethnicity: null,
      documentAddress: null,
    });
    await waitFor(() => expect(screen.queryByText("late-sensitive-value")).not.toBeInTheDocument());

    view.rerender(
      <TenantSensitivePanel
        api={api as unknown as RentalApi}
        organizationId="org-a"
        tenantId="tenant-1"
        maskedDocumentNumber="********0011"
        permissions={["rental_tenants:read", "rental_tenants:sensitive_read"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "查看完整身份信息" }));
    second.resolve({
      tenantId: "tenant-1",
      documentNumber: "fresh-sensitive-value",
      birthDate: null,
      gender: null,
      ethnicity: null,
      documentAddress: null,
    });
    expect(await screen.findByText("fresh-sensitive-value")).toBeInTheDocument();
    expect(api.revealTenantSensitive).toHaveBeenCalledTimes(2);
    view.rerender(
      <TenantSensitivePanel
        api={api as unknown as RentalApi}
        organizationId="org-a"
        tenantId="tenant-1"
        maskedDocumentNumber="********0011"
        permissions={["rental_tenants:read"]}
      />,
    );
    expect(screen.queryByText("fresh-sensitive-value")).not.toBeInTheDocument();
    expect(screen.getByText("********0011")).toBeInTheDocument();
  });

  it.each([
    ["organization", "org-a", "org-b", "tenant-1", "tenant-1"],
    ["tenant", "org-a", "org-a", "tenant-1", "tenant-2"],
  ])("invalidates a late reveal after %s context switch", async (_, firstOrg, nextOrg, firstTenant, nextTenant) => {
    const user = userEvent.setup();
    const reveal = deferred<RentalTenantSensitiveDetail>();
    const api = { revealTenantSensitive: vi.fn().mockReturnValue(reveal.promise) };
    const view = render(
      <TenantSensitivePanel
        api={api as unknown as RentalApi}
        organizationId={firstOrg}
        tenantId={firstTenant}
        maskedDocumentNumber="********0011"
        permissions={["rental_tenants:read", "rental_tenants:sensitive_read"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "查看完整身份信息" }));
    const signal = (api.revealTenantSensitive.mock.calls[0] as [object, { signal: AbortSignal }])[1]
      .signal;
    view.rerender(
      <TenantSensitivePanel
        api={api as unknown as RentalApi}
        organizationId={nextOrg}
        tenantId={nextTenant}
        maskedDocumentNumber="********0022"
        permissions={["rental_tenants:read", "rental_tenants:sensitive_read"]}
      />,
    );
    expect(signal.aborted).toBe(true);
    expect(screen.getByText("********0022")).toBeInTheDocument();
    reveal.resolve({
      tenantId: firstTenant,
      documentNumber: "stale-context-value",
      birthDate: null,
      gender: null,
      ethnicity: null,
      documentAddress: null,
    });
    await waitFor(() => expect(screen.queryByText("stale-context-value")).not.toBeInTheDocument());
  });

  it("aborts an in-flight reveal on unmount", async () => {
    const user = userEvent.setup();
    const reveal = deferred<RentalTenantSensitiveDetail>();
    const api = { revealTenantSensitive: vi.fn().mockReturnValue(reveal.promise) };
    const view = render(
      <TenantSensitivePanel
        api={api as unknown as RentalApi}
        organizationId="org-a"
        tenantId="tenant-1"
        maskedDocumentNumber="********0011"
        permissions={["rental_tenants:read", "rental_tenants:sensitive_read"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "查看完整身份信息" }));
    const signal = (api.revealTenantSensitive.mock.calls[0] as [object, { signal: AbortSignal }])[1]
      .signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it("shows the server message for a status conflict", async () => {
    const user = userEvent.setup();
    renderPage(
      {
        tenantDetail: vi.fn().mockResolvedValue(tenant),
        listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
        setTenantStatus: vi
          .fn()
          .mockRejectedValue(new ApiError(409, "CONFLICT", "租客存在生效合同，不能停用")),
      },
      ["rental_tenants:read", "rental_tenants:update"],
    );
    await screen.findByRole("heading", { name: "张三" });
    await user.click(screen.getByRole("button", { name: "停用" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("租客存在生效合同，不能停用");
  });

  it("shows the server message for a delete conflict", async () => {
    const user = userEvent.setup();
    renderPage(
      {
        tenantDetail: vi.fn().mockResolvedValue(tenant),
        listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
        deleteTenant: vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", "租客仍有关联合同")),
      },
      ["rental_tenants:read", "rental_tenants:delete"],
    );
    await screen.findByRole("heading", { name: "张三" });
    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("租客仍有关联合同");
  });

  it("checks update permission again when an open edit form submits", async () => {
    const user = userEvent.setup();
    const api = {
      tenantDetail: vi.fn().mockResolvedValue(tenant),
      listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      updateTenant: vi.fn().mockResolvedValue(tenant),
    };
    const view = renderPage(api, ["rental_tenants:read", "rental_tenants:update"]);
    await screen.findByRole("heading", { name: "张三" });
    await user.click(screen.getByRole("button", { name: "编辑" }));
    view.rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TenantDetailPage
          api={api as unknown as RentalApi}
          organizationId="org-a"
          tenantId="tenant-1"
          permissions={["rental_tenants:read"]}
        />
      </QueryClientProvider>,
    );
    await user.clear(screen.getByLabelText("租客名称"));
    await user.type(screen.getByLabelText("租客名称"), "新名称");
    await user.click(screen.getByRole("button", { name: "保存租客" }));
    await waitFor(() => expect(api.updateTenant).not.toHaveBeenCalled());
  });
});
