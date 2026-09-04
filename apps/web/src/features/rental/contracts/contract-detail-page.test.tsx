import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  PermissionKey,
  RentalContractDetail,
  RentalContractPartySensitiveDetail,
} from "@xpense/shared";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { rentalKeys } from "../../../services/rental-query";
import { ContractActions } from "./contract-actions";
import { ContractDetailPage } from "./contract-detail-page";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const detail: RentalContractDetail = {
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
  billingAnchor: "contract_start",
  paymentIntervalMonths: 1,
  dueDaysBefore: 3,
  hasScheduledTermination: true,
  renewedFromContractId: "contract-old",
  cancellationReason: null,
  terminationDate: "2027-01-31",
  terminationReason: "提前收回",
  note: "月初交租",
  spaces: [
    {
      spaceId: "space-1",
      spaceName: "101",
      spaceCode: "A-101",
      spacePath: [
        { id: "building-1", name: "1号楼" },
        { id: "space-1", name: "101" },
      ],
      rentAllocationMinor: 800000,
    },
  ],
  parties: [
    {
      tenantId: "tenant-1",
      type: "individual",
      name: "张三",
      phone: "13800000000",
      email: null,
      primaryContactName: null,
      primaryContactPhone: null,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentTypeOtherName: null,
      maskedDocumentNumber: "********0011",
      validFrom: "2026-08-01",
      validTo: "2027-01-01",
      isPrimaryPayer: true,
    },
  ],
  depositTerms: [
    {
      id: "deposit-1",
      type: "rental",
      customName: null,
      calculationMode: "fixed_amount",
      fixedAmountMinor: 1600000,
      rentMultiple: null,
      finalAmountMinor: 1600000,
      sortOrder: 0,
    },
  ],
  createdAt: "2026-08-30T00:00:00.000Z",
};

function createApi(overrides: Partial<RentalApi> = {}): RentalApi {
  return {
    contractDetail: vi.fn().mockResolvedValue(detail),
    listContracts: vi.fn(),
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
} = {}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContractDetailPage
        api={api}
        organizationId="org-a"
        contractId="contract-1"
        permissions={permissions}
        search={{ keyword: "RC-2026", page: 2 }}
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("ContractDetailPage", () => {
  it("renders the single detail response without duplicate detail requests", async () => {
    const api = createApi();
    renderPage({ api });

    expect(await screen.findByRole("heading", { name: "RC-2026-000001" })).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("1号楼 / 101")).toBeInTheDocument();
    expect(screen.getByText("********0011")).toBeInTheDocument();
    expect(screen.getByText("押金")).toBeInTheDocument();
    expect(screen.getByText("月初交租")).toBeInTheDocument();
    expect(screen.getByText("提前收回")).toBeInTheDocument();
    expect(api.contractDetail).toHaveBeenCalledTimes(1);
  });

  it("shows a recoverable detail error", async () => {
    const api = createApi({ contractDetail: vi.fn().mockRejectedValue(new Error("offline")) });
    renderPage({ api });
    expect(await screen.findByRole("alert")).toHaveTextContent("加载合同详情失败");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("separates forbidden and missing contract detail states", async () => {
    const forbiddenApi = createApi({
      contractDetail: vi.fn().mockRejectedValue(new ApiError(403, "FORBIDDEN", "forbidden")),
    });
    const forbiddenView = renderPage({ api: forbiddenApi });
    expect(await screen.findByText("你没有查看合同的权限。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    forbiddenView.unmount();

    const missingApi = createApi({
      contractDetail: vi.fn().mockRejectedValue(new ApiError(404, "NOT_FOUND", "missing")),
    });
    renderPage({ api: missingApi });
    expect(await screen.findByText("合同不存在或已删除。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("does not query without read permission", () => {
    const api = createApi();
    renderPage({ api, permissions: [] });
    expect(screen.getByText("你没有查看合同的权限。")).toBeInTheDocument();
    expect(api.contractDetail).not.toHaveBeenCalled();
  });

  it.each([
    ["draft", "draft", ["删除草稿"]],
    ["confirmed", "upcoming", ["取消合同"]],
    ["confirmed", "active", ["变更承租方", "提前终止", "创建续租草稿"]],
    ["confirmed", "expiring_soon", ["变更承租方", "提前终止", "创建续租草稿"]],
    ["confirmed", "expired", ["创建续租草稿"]],
    ["cancelled", "cancelled", []],
    ["terminated", "terminated", ["创建续租草稿"]],
  ] as const)("shows only state and permission allowed actions for %s/%s", (lifecycleStatus, displayStatus, labels) => {
    const api = createApi();
    const current = {
      ...detail,
      lifecycleStatus,
      displayStatus,
      hasScheduledTermination: false,
      parties: detail.parties.map((party) => ({ ...party, validTo: null })),
    } as RentalContractDetail;
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={current}
          permissions={["rental_contracts:update", "rental_contracts:delete"]}
        />
      </QueryClientProvider>,
    );
    for (const label of labels)
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    if (labels.length > 0) {
      expect(
        screen
          .getAllByRole("button")
          .filter((button) => labels.some((label) => label === button.textContent)),
      ).toHaveLength(labels.length);
    } else {
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    }
  });

  it("shows revoke instead of terminate when a confirmed contract has a scheduled termination", () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={createApi()}
          organizationId="org-a"
          contract={{ ...detail, displayStatus: "active", hasScheduledTermination: true }}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("button", { name: "撤销预定终止" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提前终止" })).not.toBeInTheDocument();
  });

  it("requires a reason before revoke and preserves the server conflict message", async () => {
    const user = userEvent.setup();
    const conflict = "该合同已有后续合同，不能撤销终止";
    const api = createApi({
      revokeContractTermination: vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", conflict)),
    });
    const scheduled = { ...detail, hasScheduledTermination: true };
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={scheduled}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "撤销预定终止" }));
    await user.click(screen.getByRole("button", { name: "确认撤销预定终止" }));
    expect(api.revokeContractTermination).not.toHaveBeenCalled();
    expect(screen.getByText("请输入原因。")).toBeInTheDocument();
    await user.type(screen.getByLabelText("原因"), "冲突复核");
    await user.click(screen.getByRole("button", { name: "确认撤销预定终止" }));
    expect(await screen.findByText(conflict)).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(conflict);
    expect(api.revokeContractTermination).toHaveBeenCalledWith({
      id: "contract-1",
      reason: "冲突复核",
    });
  });

  it("does not call cancel when the reason is blank", async () => {
    const user = userEvent.setup();
    const cancelContract = vi.fn().mockResolvedValue(detail);
    const api = createApi({ cancelContract });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={{ ...detail, displayStatus: "upcoming" }}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "取消合同" }));
    await user.click(screen.getByRole("button", { name: "确认取消合同" }));
    expect(cancelContract).not.toHaveBeenCalled();
    expect(screen.getByText("请输入原因。")).toBeInTheDocument();
  });

  it("validates termination calendar dates before calling the server", async () => {
    const user = userEvent.setup();
    const terminateContract = vi.fn().mockResolvedValue(detail);
    const api = createApi({ terminateContract });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={{ ...detail, hasScheduledTermination: false }}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "提前终止" }));
    fireEvent.change(screen.getByLabelText("终止日期"), { target: { value: "2026-02-31" } });
    await user.type(screen.getByLabelText("原因"), "需要提前终止");
    await user.click(screen.getByRole("button", { name: "确认提前终止" }));
    expect(terminateContract).not.toHaveBeenCalled();
    expect(screen.getByText("请输入有效的日期。")).toBeInTheDocument();
  });

  it("rejects duplicate change-party tenants before mutation", async () => {
    const user = userEvent.setup();
    const changeContractParties = vi.fn().mockResolvedValue(detail);
    const api = createApi({ changeContractParties });
    const current = {
      ...detail,
      hasScheduledTermination: false,
      parties: [
        { ...detail.parties[0], validTo: null },
        { ...detail.parties[0], tenantId: "tenant-2", validTo: null, isPrimaryPayer: false },
      ],
    } as RentalContractDetail;
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={current}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "变更承租方" }));
    await user.clear(screen.getByLabelText("生效日期"));
    await user.type(screen.getByLabelText("生效日期"), "2026-09-01");
    await user.type(screen.getByLabelText("原因"), "付款人调整");
    fireEvent.change(screen.getByLabelText("承租方 2"), { target: { value: "tenant-1" } });
    await user.click(screen.getByRole("button", { name: "确认变更承租方" }));
    expect(changeContractParties).not.toHaveBeenCalled();
    expect(screen.getByText("承租方不能重复或为空。")).toBeInTheDocument();
  });

  it("keeps the editable party row mounted while typing and focuses its linked validation error", async () => {
    const user = userEvent.setup();
    const api = createApi({ changeContractParties: vi.fn().mockResolvedValue(detail) });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={{
            ...detail,
            hasScheduledTermination: false,
            parties: detail.parties.map((party) => ({ ...party, validTo: null })),
          }}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "变更承租方" }));
    const tenantInput = screen.getByLabelText("承租方 1");
    await user.clear(tenantInput);
    await user.type(tenantInput, "tenant-replacement");
    expect(screen.getByLabelText("承租方 1")).toHaveValue("tenant-replacement");
    await user.click(screen.getByRole("button", { name: "确认变更承租方" }));
    expect(screen.getByLabelText("生效日期")).toHaveFocus();
    expect(screen.getByLabelText("生效日期")).toHaveAttribute(
      "aria-describedby",
      "contract-action-effective-date-error",
    );
  });

  it("binds an open dialog to its original organization and contract", async () => {
    const user = userEvent.setup();
    const cancelContract = vi.fn().mockResolvedValue(detail);
    const api = createApi({ cancelContract });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = { ...detail, displayStatus: "upcoming" as const };
    const second = {
      ...first,
      id: "contract-2",
      contractNumber: "RC-2026-000002",
      propertyId: "property-2",
    };
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={first}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "取消合同" }));
    await user.type(screen.getByLabelText("原因"), "只针对第一份合同");
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ContractActions
          api={api}
          organizationId="org-b"
          contract={second}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "确认取消合同" }));
    expect(cancelContract).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("当前合同上下文已变化");
  });

  it("blocks submission when permission is revoked after opening an action", async () => {
    const user = userEvent.setup();
    const cancelContract = vi.fn().mockResolvedValue(detail);
    const api = createApi({ cancelContract });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const upcoming = { ...detail, displayStatus: "upcoming" as const };
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={upcoming}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "取消合同" }));
    await user.type(screen.getByLabelText("原因"), "权限撤销测试");
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ContractActions api={api} organizationId="org-a" contract={upcoming} permissions={[]} />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "确认取消合同" }));
    expect(cancelContract).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("当前权限或合同状态已变化");
  });

  it("invalidates stale contract scopes when a mutation returns 404", async () => {
    const user = userEvent.setup();
    const api = createApi({
      cancelContract: vi
        .fn()
        .mockRejectedValue(new ApiError(404, "NOT_FOUND", "合同不存在或已删除")),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const removeQueries = vi.spyOn(queryClient, "removeQueries");
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QueryClientProvider client={queryClient}>
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={{ ...detail, displayStatus: "upcoming" }}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "取消合同" }));
    await user.type(screen.getByLabelText("原因"), "取消不存在合同");
    await user.click(screen.getByRole("button", { name: "确认取消合同" }));
    expect(await screen.findByText("合同不存在或已删除。")).toBeInTheDocument();
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: rentalKeys.contract("org-a", "contract-1"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: rentalKeys.contractsRoot("org-a"),
    });
  });

  it.each([
    [new ApiError(403, "FORBIDDEN", "forbidden"), "你没有执行此操作的权限。"],
    [new Error("offline"), "网络异常，请检查连接后重试。"],
  ])("keeps the dialog open with a safe mutation error", async (error, message) => {
    const user = userEvent.setup();
    const api = createApi({ cancelContract: vi.fn().mockRejectedValue(error) });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={{ ...detail, displayStatus: "upcoming" }}
          permissions={["rental_contracts:update"]}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "取消合同" }));
    await user.type(screen.getByLabelText("原因"), "错误反馈测试");
    await user.click(screen.getByRole("button", { name: "确认取消合同" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("原因")).toHaveValue("错误反馈测试");
  });

  it("returns from deleted drafts with the preserved list search", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const search = { keyword: "RC-2026", page: 2 };
    const api = createApi({ deleteContract: vi.fn().mockResolvedValue(undefined) });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={{ ...detail, lifecycleStatus: "draft", displayStatus: "draft" }}
          permissions={["rental_contracts:delete"]}
          search={search}
          navigate={navigate}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "删除草稿" }));
    await user.click(screen.getByRole("button", { name: "确认删除草稿" }));
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/rentals/contracts",
        search,
        replace: true,
      }),
    );
  });

  it("does not navigate when a pending renewal completes after the context changed", async () => {
    const user = userEvent.setup();
    const pending = deferred<RentalContractDetail>();
    const navigate = vi.fn();
    const api = createApi({ renewContract: vi.fn().mockReturnValue(pending.promise) });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = {
      ...detail,
      lifecycleStatus: "terminated" as const,
      displayStatus: "terminated" as const,
    };
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={first}
          permissions={["rental_contracts:update"]}
          navigate={navigate}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "创建续租草稿" }));
    await user.click(screen.getByRole("button", { name: "确认创建续租草稿" }));
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ContractActions
          api={api}
          organizationId="org-b"
          contract={{ ...first, id: "contract-2", propertyId: "property-2" }}
          permissions={["rental_contracts:update"]}
          navigate={navigate}
        />
      </QueryClientProvider>,
    );
    pending.resolve({
      ...first,
      id: "draft-late",
      lifecycleStatus: "draft",
      displayStatus: "draft",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("renews to the returned draft detail and invalidates source and new contract scopes", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const renewed = {
      ...detail,
      id: "draft-2",
      lifecycleStatus: "draft",
      displayStatus: "draft",
      propertyId: "property-2",
    } as RentalContractDetail;
    const api = createApi({ renewContract: vi.fn().mockResolvedValue(renewed) });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QueryClientProvider client={queryClient}>
        <ContractActions
          api={api}
          organizationId="org-a"
          contract={{ ...detail, lifecycleStatus: "terminated", displayStatus: "terminated" }}
          permissions={["rental_contracts:update"]}
          navigate={navigate}
        />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "创建续租草稿" }));
    await user.click(screen.getByRole("button", { name: "确认创建续租草稿" }));
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ params: { contractId: "draft-2" }, replace: true }),
      ),
    );
    expect(api.renewContract).toHaveBeenCalledWith({ id: "contract-1" });
    expect(navigate).toHaveBeenCalledWith({
      to: "/rentals/contracts/$contractId",
      params: { contractId: "draft-2" },
      replace: true,
    });
    for (const queryKey of [
      rentalKeys.contractsRoot("org-a"),
      rentalKeys.contract("org-a", "contract-1"),
      rentalKeys.contract("org-a", "draft-2"),
      rentalKeys.property("org-a", "property-1"),
      rentalKeys.property("org-a", "property-2"),
      rentalKeys.spacesRoot("org-a", "property-1"),
      rentalKeys.spacesRoot("org-a", "property-2"),
      rentalKeys.childrenRoot("org-a", "property-1"),
      rentalKeys.childrenRoot("org-a", "property-2"),
      rentalKeys.searchRoot("org-a", "property-1"),
      rentalKeys.searchRoot("org-a", "property-2"),
    ])
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
  });

  it("reveals a historical identity only on demand and clears it before a second reveal", async () => {
    const user = userEvent.setup();
    const first = deferred<RentalContractPartySensitiveDetail>();
    const second = deferred<RentalContractPartySensitiveDetail>();
    const api = createApi({
      revealContractPartySensitive: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    });
    const { unmount } = renderPage({
      api,
      permissions: ["rental_contracts:read", "rental_tenants:sensitive_read"],
    });
    expect(await screen.findByRole("button", { name: "查看完整身份" })).toBeInTheDocument();
    expect(api.revealContractPartySensitive).not.toHaveBeenCalled();
    const revealButton = screen.getByRole("button", { name: "查看完整身份" });
    await user.click(revealButton);
    expect(api.revealContractPartySensitive).toHaveBeenCalledWith(
      { contractId: "contract-1", tenantId: "tenant-1", validFrom: "2026-08-01" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    first.resolve({ ...detailSensitive, documentNumber: "440300199001011234" });
    expect(await screen.findByText("440300199001011234")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByText("********0011")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看完整身份" }));
    expect(api.revealContractPartySensitive).toHaveBeenCalledTimes(2);
    second.resolve({ ...detailSensitive, documentNumber: "440300199001015678" });
    expect(await screen.findByText("440300199001015678")).toBeInTheDocument();
    unmount();
  });

  it("aborts and clears an in-flight reveal when sensitive permission is revoked", async () => {
    const user = userEvent.setup();
    const pending = deferred<RentalContractPartySensitiveDetail>();
    const api = createApi({
      revealContractPartySensitive: vi.fn().mockReturnValue(pending.promise),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ContractDetailPage
          api={api}
          organizationId="org-a"
          contractId="contract-1"
          permissions={["rental_contracts:read", "rental_tenants:sensitive_read"]}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "查看完整身份" }));
    const requestOptions = (api.revealContractPartySensitive as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as { signal: AbortSignal };
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ContractDetailPage
          api={api}
          organizationId="org-a"
          contractId="contract-1"
          permissions={["rental_contracts:read"]}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(requestOptions.signal.aborted).toBe(true);
    pending.resolve({ ...detailSensitive, documentNumber: "440300199001019999" });
    await Promise.resolve();
    expect(screen.queryByText("440300199001019999")).not.toBeInTheDocument();
    expect(screen.getByText("********0011")).toBeInTheDocument();
  });

  it("lets an in-flight reveal be restarted or cancelled without late raw data", async () => {
    const user = userEvent.setup();
    const first = deferred<RentalContractPartySensitiveDetail>();
    const second = deferred<RentalContractPartySensitiveDetail>();
    const api = createApi({
      revealContractPartySensitive: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ContractDetailPage
          api={api}
          organizationId="org-a"
          contractId="contract-1"
          permissions={["rental_contracts:read", "rental_tenants:sensitive_read"]}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "查看完整身份" }));
    const firstSignal = (api.revealContractPartySensitive as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1].signal as AbortSignal;
    await user.click(screen.getByRole("button", { name: "重新查看" }));
    expect(firstSignal.aborted).toBe(true);
    const secondSignal = (api.revealContractPartySensitive as ReturnType<typeof vi.fn>).mock
      .calls[1]?.[1].signal as AbortSignal;
    await user.click(screen.getByRole("button", { name: "取消查看" }));
    expect(secondSignal.aborted).toBe(true);
    first.resolve({ ...detailSensitive, documentNumber: "440300199001010001" });
    second.resolve({ ...detailSensitive, documentNumber: "440300199001010002" });
    await Promise.resolve();
    expect(screen.queryByText("440300199001010001")).not.toBeInTheDocument();
    expect(screen.queryByText("440300199001010002")).not.toBeInTheDocument();
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain("44030019900101000");
  });

  it("does not let a late reveal from the previous contract or organization reappear", async () => {
    const user = userEvent.setup();
    const pending = deferred<RentalContractPartySensitiveDetail>();
    const api = createApi({
      revealContractPartySensitive: vi.fn().mockReturnValue(pending.promise),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ContractDetailPage
          api={api}
          organizationId="org-a"
          contractId="contract-1"
          permissions={["rental_contracts:read", "rental_tenants:sensitive_read"]}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "查看完整身份" }));
    const signal = (api.revealContractPartySensitive as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      .signal as AbortSignal;
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ContractDetailPage
          api={api}
          organizationId="org-b"
          contractId="contract-2"
          permissions={["rental_contracts:read", "rental_tenants:sensitive_read"]}
          navigate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(signal.aborted).toBe(true);
    pending.resolve({ ...detailSensitive, documentNumber: "440300199001018888" });
    await Promise.resolve();
    expect(screen.queryByText("440300199001018888")).not.toBeInTheDocument();
  });

  it("aborts an in-flight reveal when the detail page unmounts", async () => {
    const user = userEvent.setup();
    const pending = deferred<RentalContractPartySensitiveDetail>();
    const api = createApi({
      revealContractPartySensitive: vi.fn().mockReturnValue(pending.promise),
    });
    const view = renderPage({
      api,
      permissions: ["rental_contracts:read", "rental_tenants:sensitive_read"],
    });
    await user.click(await screen.findByRole("button", { name: "查看完整身份" }));
    const signal = (api.revealContractPartySensitive as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      .signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});

const detailSensitive: RentalContractPartySensitiveDetail = {
  contractId: "contract-1",
  tenantId: "tenant-1",
  validFrom: "2026-08-01",
  validTo: "2027-01-01",
  documentNumber: null,
  birthDate: null,
  gender: null,
  ethnicity: null,
  documentAddress: null,
};
