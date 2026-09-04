import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  PermissionKey,
  RentalContractAvailability,
  RentalContractDetail,
  RentalPropertyDetail,
  RentalPropertyPage,
} from "@xpense/shared";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { rentalKeys } from "../../../services/rental-query";
import { ContractFormPage } from "./contract-form-page";
import { type ContractFormValues, defaultContractFormValues } from "./contract-form-schema";
import { ContractPartiesStep } from "./steps/contract-parties-step";
import { ContractReviewStep } from "./steps/contract-review-step";
import { ContractTermsStep, calendarPreview } from "./steps/contract-terms-step";
import { useContractDraft } from "./use-contract-draft";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useBlocker: vi.fn() };
});

const blockerMock = vi.mocked(useBlocker);
const idleBlocker = {
  status: "idle" as const,
  current: undefined,
  next: undefined,
  action: undefined,
  proceed: undefined,
  reset: undefined,
};

beforeEach(() => {
  blockerMock.mockReset();
  blockerMock.mockReturnValue(idleBlocker as never);
});

const propertyId = "11111111-1111-4111-8111-111111111111";
const spaceId = "22222222-2222-4222-8222-222222222222";
const draftId = "33333333-3333-4333-8333-333333333333";

function detail(overrides: Partial<RentalContractDetail> = {}): RentalContractDetail {
  return {
    id: draftId,
    propertyId,
    propertyName: "阳光公寓",
    contractNumber: "DRAFT-1",
    externalContractNumber: null,
    lifecycleStatus: "draft",
    displayStatus: "draft",
    startDate: null,
    endDate: null,
    actualEndDate: null,
    rentAmountMinor: null,
    tenantNames: [],
    spaceNames: [],
    updatedAt: "2026-08-30T00:00:00.000Z",
    billingAnchor: null,
    paymentIntervalMonths: null,
    dueDaysBefore: null,
    hasScheduledTermination: false,
    renewedFromContractId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationReason: null,
    note: null,
    spaces: [],
    parties: [],
    depositTerms: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function completeDetail(overrides: Partial<RentalContractDetail> = {}): RentalContractDetail {
  return detail({
    spaces: [
      { spaceId, spaceName: "101", spaceCode: "101", spacePath: [], rentAllocationMinor: null },
    ],
    spaceNames: ["101"],
    parties: [
      {
        tenantId: "44444444-4444-4444-8444-444444444444",
        type: "individual",
        name: "张三",
        phone: null,
        email: null,
        primaryContactName: null,
        primaryContactPhone: null,
        documentCountryCode: null,
        documentType: null,
        documentTypeOtherName: null,
        maskedDocumentNumber: null,
        validFrom: null,
        validTo: null,
        isPrimaryPayer: true,
      },
    ],
    tenantNames: ["张三"],
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    rentAmountMinor: 800000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 5,
    ...overrides,
  });
}

function renderPage(
  api: RentalApi,
  permissions: readonly PermissionKey[] = [
    "rental_contracts:create",
    "rental_contracts:read",
    "rental_contracts:update",
    "rental_properties:read",
    "rental_spaces:read",
  ],
  search: { draftId?: string; propertyId?: string; spaceIds?: string[] } = {},
) {
  const navigate = vi.fn().mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ContractFormPage
        api={api}
        organizationId="org-a"
        permissions={permissions}
        canCreate={permissions.includes("rental_contracts:create")}
        search={search}
        navigate={navigate as never}
      />
    </QueryClientProvider>,
  );
  return { navigate, queryClient };
}

function renderPageWithRerender(
  api: RentalApi,
  search: { draftId?: string; propertyId?: string; spaceIds?: string[] } = {},
  navigateOverride?: (input: unknown) => Promise<unknown>,
) {
  const navigate = navigateOverride ?? vi.fn().mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let forceRerender: (() => void) | undefined;
  function Harness() {
    const [, setVersion] = useState(0);
    forceRerender = () => setVersion((version) => version + 1);
    return (
      <QueryClientProvider client={queryClient}>
        <ContractFormPage
          api={api}
          organizationId="org-a"
          permissions={[
            "rental_contracts:create",
            "rental_contracts:read",
            "rental_contracts:update",
            "rental_properties:read",
            "rental_spaces:read",
          ]}
          canCreate
          search={search}
          navigate={navigate as never}
        />
      </QueryClientProvider>
    );
  }
  const rendered = render(<Harness />);
  return { ...rendered, navigate, queryClient, forceRerender: () => forceRerender?.() };
}

function baseApi(overrides: Partial<RentalApi> = {}): RentalApi {
  return {
    listProperties: vi.fn().mockResolvedValue({
      items: [
        {
          id: propertyId,
          ledgerId: "ledger-1",
          name: "阳光公寓",
          type: "apartment_building",
          customTypeName: null,
          countryCode: "CN",
          province: null,
          city: null,
          district: null,
          addressLine: "1号",
          isActive: true,
          spaceCount: 1,
          rentableSpaceCount: 1,
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    } satisfies RentalPropertyPage),
    getProperty: vi.fn().mockResolvedValue({
      id: propertyId,
      ledgerId: "ledger-1",
      name: "阳光公寓",
      type: "apartment_building",
      customTypeName: null,
      countryCode: "CN",
      province: null,
      city: null,
      district: null,
      addressLine: "1号",
      isActive: true,
      spaceCount: 1,
      rentableSpaceCount: 1,
      updatedAt: "2026-08-30T00:00:00.000Z",
      note: null,
      createdAt: "2026-08-30T00:00:00.000Z",
      activeContractCount: 0,
      upcomingContractCount: 0,
      expiringSoonContractCount: 0,
    } satisfies RentalPropertyDetail),
    listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
    searchSpaces: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    contractDetail: vi.fn(),
    createContract: vi.fn(),
    updateContract: vi.fn(),
    ...overrides,
  } as RentalApi;
}

function spaceNode() {
  return {
    id: spaceId,
    propertyId,
    parentId: null,
    name: "101",
    code: "101",
    type: "room" as const,
    customTypeName: null,
    isRentable: true,
    isActive: true,
    note: null,
    isEffectivelyActive: true,
    sortOrder: 1,
    hasChildren: false,
    leaseStatus: "vacant" as const,
    leaseBlockedReason: null,
    hasUpcomingContract: false,
  };
}

function latestBlockerOptions() {
  return blockerMock.mock.calls.at(-1)?.[0] as unknown as {
    shouldBlockFn: (args: never) => boolean | Promise<boolean>;
    enableBeforeUnload?: boolean | (() => boolean);
  };
}

describe("ContractFormPage", () => {
  it("does not request anything when contract permissions are incomplete", () => {
    const api = baseApi();
    renderPage(api, []);
    expect(api.listProperties).not.toHaveBeenCalled();
    expect(api.contractDetail).not.toHaveBeenCalled();
    expect(api.createContract).not.toHaveBeenCalled();
  });

  it.each([
    "rental_contracts:create",
    "rental_contracts:read",
    "rental_contracts:update",
  ] as const)("gates the contract flow when %s is missing", (missing) => {
    const api = baseApi({
      contractDetail: vi.fn(),
      createContract: vi.fn(),
      updateContract: vi.fn(),
      checkContractAvailability: vi.fn(),
      confirmContract: vi.fn(),
    });
    const permissions = [
      "rental_contracts:create",
      "rental_contracts:read",
      "rental_contracts:update",
    ].filter((permission) => permission !== missing) as PermissionKey[];
    renderPage(api, permissions);
    expect(api.contractDetail).not.toHaveBeenCalled();
    expect(api.createContract).not.toHaveBeenCalled();
    expect(api.updateContract).not.toHaveBeenCalled();
    expect(api.checkContractAvailability).not.toHaveBeenCalled();
    expect(api.confirmContract).not.toHaveBeenCalled();
    expect(screen.getByText("你没有完成合同创建所需的权限。")).toBeInTheDocument();
  });

  it("lets a blank new contract choose an active property", async () => {
    const user = userEvent.setup();
    const api = baseApi();
    renderPage(api);

    expect(await screen.findByRole("heading", { name: "选择房产与空间" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "阳光公寓" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("房产"), propertyId);
    expect(screen.getByText("已选择房产：阳光公寓")).toBeInTheDocument();
  });

  it("clears pending operation when the draft session changes", async () => {
    let resolveUpdate: (value: RentalContractDetail) => void = () => undefined;
    const updateContract = vi.fn(
      () => new Promise<RentalContractDetail>((resolve) => (resolveUpdate = resolve)),
    );
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(detail()),
      updateContract,
      checkContractAvailability: vi.fn(),
      confirmContract: vi.fn(),
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {children}
      </QueryClientProvider>
    );
    const values = {
      ...defaultContractFormValues(propertyId),
      spaces: [{ spaceId, rentAllocationText: "" }],
    };
    const { result, rerender } = renderHook(
      ({ currentDraftId }: { currentDraftId: string }) =>
        useContractDraft({
          api,
          organizationId: "org-a",
          draftId: currentDraftId,
          canRead: true,
          canCreate: true,
          canUpdate: true,
        }),
      { initialProps: { currentDraftId: draftId }, wrapper },
    );
    let savePromise: Promise<unknown> | undefined;
    await act(async () => {
      savePromise = result.current.save(values, 0);
      await Promise.resolve();
    });
    expect(result.current.operation).toBe("saving");
    rerender({ currentDraftId: "55555555-5555-4555-8555-555555555555" });
    await waitFor(() => expect(result.current.operation).toBe("idle"));
    resolveUpdate(detail());
    await savePromise;
  });

  it("resets new-contract values when the seeded property changes", async () => {
    const otherPropertyId = "77777777-7777-4777-8777-777777777777";
    const api = baseApi();
    let setSearch: ((next: { propertyId?: string }) => void) | undefined;
    const navigate = vi.fn().mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Harness() {
      const [search, updateSearch] = useState<{ propertyId?: string }>({ propertyId });
      setSearch = updateSearch;
      return (
        <ContractFormPage
          api={api}
          organizationId="org-a"
          permissions={[
            "rental_contracts:create",
            "rental_contracts:read",
            "rental_contracts:update",
            "rental_properties:read",
            "rental_spaces:read",
          ]}
          canCreate
          search={search}
          navigate={navigate as never}
        />
      );
    }
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(`已选择房产：${propertyId}`)).toBeInTheDocument();
    act(() => setSearch?.({ propertyId: otherPropertyId }));
    expect(await screen.findByText(`已选择房产：${otherPropertyId}`)).toBeInTheDocument();
  });

  it("adopts a created draft route once without refetching or re-creating", async () => {
    const user = userEvent.setup();
    const createContract = vi.fn().mockResolvedValue(detail());
    const contractDetail = vi.fn();
    const api = baseApi({
      createContract,
      contractDetail,
      listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
    });
    let setSearch: ((next: { draftId?: string; propertyId?: string }) => void) | undefined;
    const navigate = vi.fn((input: { search?: { draftId?: string; propertyId?: string } }) => {
      if (input.search) setSearch?.(input.search);
      return Promise.resolve();
    });
    function Harness() {
      const [search, updateSearch] = useState<{ draftId?: string; propertyId?: string }>({
        propertyId,
      });
      setSearch = updateSearch;
      return (
        <ContractFormPage
          api={api}
          organizationId="org-a"
          permissions={[
            "rental_contracts:create",
            "rental_contracts:read",
            "rental_contracts:update",
            "rental_properties:read",
            "rental_spaces:read",
          ]}
          canCreate
          search={search}
          navigate={navigate as never}
        />
      );
    }
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Harness />
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "创建草稿" });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(contractDetail).not.toHaveBeenCalled();
    expect(createContract).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "保存空间并下一步" })).toBeInTheDocument();
  });

  it("does not offer save retry for a local validation error", async () => {
    const user = userEvent.setup();
    const api = baseApi();
    renderPage(api);
    await screen.findByRole("button", { name: "创建草稿" });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请选择房产");
    expect(screen.queryByRole("button", { name: "重试保存" })).not.toBeInTheDocument();
  });

  it("creates a property-only checkpoint before saving spaces", async () => {
    const user = userEvent.setup();
    const createContract = vi.fn().mockResolvedValue(detail());
    const updateContract = vi.fn().mockResolvedValue(
      detail({
        spaces: [
          {
            spaceId,
            spaceName: "101",
            spaceCode: null,
            spacePath: [],
            rentAllocationMinor: null,
          },
        ],
      }),
    );
    const api = baseApi({
      createContract,
      updateContract,
      listChildren: vi
        .fn()
        .mockResolvedValue({ items: [spaceNode()], total: 1, page: 1, pageSize: 50 }),
    });
    const { navigate } = renderPage(api, undefined, { propertyId });

    expect(await screen.findByRole("heading", { name: "选择房产与空间" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建草稿" }));
    expect(createContract).toHaveBeenCalledWith({ propertyId });
    expect(updateContract).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "选择房产与空间" })).toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith({ search: { draftId }, replace: true });

    await user.click(await screen.findByRole("button", { name: "选择" }));
    await user.click(screen.getByRole("button", { name: "保存空间并下一步" }));
    expect(updateContract).toHaveBeenCalledWith({ id: draftId, propertyId, spaces: [{ spaceId }] });
    expect(navigate.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      updateContract.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("keeps the draft after update failure and retry never creates a second draft", async () => {
    const user = userEvent.setup();
    const createContract = vi.fn().mockResolvedValue(detail());
    const updateContract = vi
      .fn()
      .mockRejectedValueOnce(new Error("保存失败"))
      .mockResolvedValueOnce(detail({ spaces: [] }));
    const api = baseApi({ createContract, updateContract });
    api.listChildren = vi
      .fn()
      .mockResolvedValue({ items: [spaceNode()], total: 1, page: 1, pageSize: 50 });
    renderPage(api, undefined, { propertyId });

    await screen.findByRole("heading", { name: "选择房产与空间" });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));
    expect(createContract).toHaveBeenCalledTimes(1);
    expect(updateContract).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "选择" }));
    await user.click(screen.getByRole("button", { name: "保存空间并下一步" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后重试。");
    expect(screen.getByRole("alert")).not.toHaveTextContent("保存失败");
    await user.type(screen.getByLabelText(`空间 ${spaceId}`), "100");
    await user.click(screen.getByRole("button", { name: "重试保存" }));
    expect(createContract).toHaveBeenCalledTimes(1);
    expect(updateContract).toHaveBeenCalledTimes(2);
    expect(updateContract).toHaveBeenLastCalledWith({
      id: draftId,
      propertyId,
      spaces: [{ spaceId, rentAllocationMinor: 10000 }],
    });
  });

  it("does not create a draft until the selected property is verified active", async () => {
    const user = userEvent.setup();
    const createContract = vi.fn().mockResolvedValue(detail());
    const getProperty = vi.fn(() => new Promise<RentalPropertyDetail>(() => undefined));
    const api = baseApi({ getProperty, createContract });
    renderPage(api, undefined, { propertyId });

    await screen.findByRole("button", { name: "创建草稿" });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));

    expect(getProperty).toHaveBeenCalledWith(propertyId);
    expect(createContract).not.toHaveBeenCalled();
  });

  it("does not create a draft when the selected property is inactive", async () => {
    const user = userEvent.setup();
    const createContract = vi.fn().mockResolvedValue(detail());
    let resolveProperty: (value: RentalPropertyDetail) => void = () => undefined;
    const getProperty = vi.fn(
      () => new Promise<RentalPropertyDetail>((resolve) => (resolveProperty = resolve)),
    );
    const api = baseApi({ getProperty, createContract });
    renderPage(api, undefined, { propertyId });

    await screen.findByRole("button", { name: "创建草稿" });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));
    resolveProperty({ id: propertyId, isActive: false } as RentalPropertyDetail);

    expect(await screen.findByRole("alert")).toHaveTextContent("房产不可用");
    expect(createContract).not.toHaveBeenCalled();
  });
});

describe("ContractFormPage draft session", () => {
  it("uses a safe generic message when loading fails", async () => {
    const api = baseApi({
      contractDetail: vi.fn().mockRejectedValue(new ApiError(500, "INTERNAL", "SECRET_LOAD")),
    });
    renderPage(api, undefined, { draftId });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("操作失败，请稍后重试。");
    expect(alert).not.toHaveTextContent("SECRET_LOAD");
  });

  it("ignores a deferred create result after the draft hook unmounts", async () => {
    let resolveCreate: (value: RentalContractDetail) => void = () => undefined;
    const createContract = vi.fn(
      () => new Promise<RentalContractDetail>((resolve) => (resolveCreate = resolve)),
    );
    const onDraftId = vi.fn();
    const api = baseApi({ createContract });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const values = defaultContractFormValues(propertyId);
    const { result, unmount } = renderHook(
      () =>
        useContractDraft({
          api,
          organizationId: "org-a",
          canRead: true,
          canCreate: true,
          canUpdate: true,
          onDraftId,
        }),
      { wrapper },
    );
    let savePromise: Promise<unknown> | undefined;
    await act(async () => {
      savePromise = result.current.save({ ...values, propertyId }, 0);
      await Promise.resolve();
    });
    unmount();
    resolveCreate(detail());
    await savePromise;
    expect(onDraftId).not.toHaveBeenCalled();
  });

  it("ignores deferred availability and confirmation results after unmount", async () => {
    let resolveAvailability: (value: RentalContractAvailability) => void = () => undefined;
    let resolveConfirm: (value: RentalContractDetail) => void = () => undefined;
    const checkContractAvailability = vi.fn(
      () => new Promise<RentalContractAvailability>((resolve) => (resolveAvailability = resolve)),
    );
    const confirmContract = vi.fn(
      () => new Promise<RentalContractDetail>((resolve) => (resolveConfirm = resolve)),
    );
    const onConfirmed = vi.fn();
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(completeDetail()),
      checkContractAvailability,
      confirmContract,
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () =>
        useContractDraft({
          api,
          organizationId: "org-a",
          draftId,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          onConfirmed,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.serverDraft).toBeTruthy());
    const values = result.current.initialValues;
    let confirmPromise: Promise<unknown> | undefined;
    await act(async () => {
      confirmPromise = result.current.checkAndConfirm(values);
      await Promise.resolve();
    });
    expect(checkContractAvailability).toHaveBeenCalledTimes(1);
    unmount();
    resolveAvailability({ available: true, conflicts: [] });
    await Promise.resolve();
    resolveConfirm(completeDetail({ lifecycleStatus: "confirmed", displayStatus: "active" }));
    await confirmPromise;
    expect(confirmContract).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("resumes a draft using the organization-scoped detail and inferred step", async () => {
    const api = baseApi({ contractDetail: vi.fn().mockResolvedValue(completeDetail()) });
    renderPage(api, undefined, { draftId });
    expect(await screen.findByRole("heading", { name: "复核并确认" })).toBeInTheDocument();
    expect(api.contractDetail).toHaveBeenCalledWith(draftId);
    expect(api.listProperties).not.toHaveBeenCalled();
  });

  it("does not hydrate a confirmed id and offers a safe details link", async () => {
    const api = baseApi({
      contractDetail: vi
        .fn()
        .mockResolvedValue(
          completeDetail({ lifecycleStatus: "confirmed", displayStatus: "active" }),
        ),
    });
    renderPage(api, undefined, { draftId });
    expect(await screen.findByRole("alert")).toHaveTextContent("已不是草稿");
    expect(screen.getByRole("link", { name: "查看合同详情" })).toHaveAttribute(
      "href",
      `/rentals/contracts/${draftId}`,
    );
  });
});

describe("ContractFormPage baseline and review safety", () => {
  it("does not overwrite dirty values or step when a draft refetches", async () => {
    const user = userEvent.setup();
    const next = completeDetail({ note: "server refresh" });
    const contractDetail = vi
      .fn()
      .mockResolvedValueOnce(completeDetail())
      .mockResolvedValueOnce(next);
    const api = baseApi({ contractDetail });
    const { queryClient } = renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    const note = screen.getByLabelText("备注");
    await user.type(note, " local");
    await queryClient.invalidateQueries({ queryKey: rentalKeys.contractDraft("org-a", draftId) });
    await waitFor(() => expect(contractDetail).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "设置合同条款" })).toBeInTheDocument();
    expect(screen.getByLabelText("备注")).toHaveValue(" local");
  });

  it("resets a normalized update response and clears dirty state", async () => {
    const user = userEvent.setup();
    const normalized = completeDetail({ note: "规范化备注" });
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValueOnce(completeDetail()).mockResolvedValue(normalized),
      updateContract: vi.fn().mockResolvedValue(normalized),
    });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    await user.clear(screen.getByLabelText("备注"));
    await user.type(screen.getByLabelText("备注"), "原始备注 ");
    await user.click(screen.getByRole("button", { name: "保存并继续" }));

    await waitFor(() => expect(api.updateContract).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "复核并确认" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    expect(screen.getByLabelText("备注")).toHaveValue("规范化备注");
    await waitFor(async () => {
      expect(latestBlockerOptions().enableBeforeUnload).toBe(false);
      expect(await latestBlockerOptions().shouldBlockFn({} as never)).toBe(false);
    });
  });

  it("keeps edits made while an update is pending dirty", async () => {
    const user = userEvent.setup();
    let resolveUpdate: (value: RentalContractDetail) => void = () => undefined;
    const updateContract = vi.fn(
      () => new Promise<RentalContractDetail>((resolve) => (resolveUpdate = resolve)),
    );
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(completeDetail()),
      updateContract,
    });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    const note = screen.getByLabelText("备注");
    await user.type(note, "首次编辑");
    await user.click(screen.getByRole("button", { name: "保存并继续" }));
    await waitFor(() => expect(updateContract).toHaveBeenCalledTimes(1));
    await user.type(note, "保存期间新编辑");
    resolveUpdate(completeDetail({ note: "规范化首次编辑" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "复核并确认" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    expect(screen.getByLabelText("备注")).toHaveValue("首次编辑保存期间新编辑");
    expect(latestBlockerOptions().enableBeforeUnload).toBe(true);
  });

  it("renders review values only from the server baseline", () => {
    const values = {
      ...defaultContractFormValues(propertyId),
      spaces: [{ spaceId, rentAllocationText: "" }],
      parties: [{ tenantId: "44444444-4444-4444-8444-444444444444", isPrimaryPayer: true }],
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      rentAmountText: "8000",
      billingAnchor: "contract_start" as const,
      paymentIntervalMonths: "1" as const,
      dueDaysBeforeText: "5",
      note: "overlay only",
    } satisfies ContractFormValues;
    render(
      <ContractReviewStep
        values={values}
        serverDraft={detail()}
        availability={null}
        confirming={false}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText("房产：阳光公寓")).toBeInTheDocument();
    expect(screen.getByText("空间：尚未保存")).toBeInTheDocument();
    expect(screen.queryByText("overlay only")).not.toBeInTheDocument();
  });
});

describe("ContractFormPage route leave protection", () => {
  it("allows navigation for a clean idle form", async () => {
    const api = baseApi({ contractDetail: vi.fn().mockResolvedValue(completeDetail()) });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });

    const options = latestBlockerOptions();
    expect(options.enableBeforeUnload).toBe(false);
    expect(await options.shouldBlockFn({} as never)).toBe(false);
  });

  it("blocks navigation when values are dirty", async () => {
    const user = userEvent.setup();
    const api = baseApi({ contractDetail: vi.fn().mockResolvedValue(completeDetail()) });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    await user.type(screen.getByLabelText("备注"), "未保存");

    await waitFor(async () => {
      const options = latestBlockerOptions();
      expect(options.enableBeforeUnload).toBe(true);
      expect(await options.shouldBlockFn({} as never)).toBe(true);
    });
  });

  it("blocks navigation while a save operation is pending", async () => {
    const user = userEvent.setup();
    const createContract = vi.fn(() => new Promise<RentalContractDetail>(() => undefined));
    const api = baseApi({ createContract });
    renderPage(api, undefined, { propertyId });
    await screen.findByRole("button", { name: "创建草稿" });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));

    await waitFor(async () => {
      const options = latestBlockerOptions();
      expect(options.enableBeforeUnload).toBe(true);
      expect(await options.shouldBlockFn({} as never)).toBe(true);
    });
  });

  it("offers to leave and discard when dirty work has not created a draft", async () => {
    const user = userEvent.setup();
    const proceed = vi.fn();
    let resolver:
      | typeof idleBlocker
      | { status: "blocked"; proceed: () => void; reset: () => void } = idleBlocker;
    blockerMock.mockImplementation(() => resolver as never);
    const api = baseApi();
    const { forceRerender } = renderPageWithRerender(api);
    await screen.findByRole("heading", { name: "选择房产与空间" });
    await screen.findByRole("option", { name: "阳光公寓" });
    await user.selectOptions(screen.getByLabelText("房产"), propertyId);
    await waitFor(async () =>
      expect(await latestBlockerOptions().shouldBlockFn({} as never)).toBe(true),
    );

    resolver = { status: "blocked", proceed, reset: vi.fn() };
    act(() => forceRerender());
    expect(screen.getByText("当前表单尚未创建草稿，离开将丢弃未保存内容。")).toBeInTheDocument();
    expect(screen.queryByText(/保留草稿/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "离开并丢弃" }));
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("does not allow leaving while the initial draft is still being created", async () => {
    const user = userEvent.setup();
    const proceed = vi.fn();
    const reset = vi.fn();
    let resolveCreate: (value: RentalContractDetail) => void = () => undefined;
    const createContract = vi.fn(
      () => new Promise<RentalContractDetail>((resolve) => (resolveCreate = resolve)),
    );
    let resolver:
      | typeof idleBlocker
      | { status: "blocked"; proceed: () => void; reset: () => void } = idleBlocker;
    blockerMock.mockImplementation(() => resolver as never);
    const api = baseApi({ createContract });
    const { forceRerender } = renderPageWithRerender(api, { propertyId });
    await screen.findByRole("button", { name: "创建草稿" });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));
    await waitFor(() => expect(createContract).toHaveBeenCalledTimes(1));

    resolver = { status: "blocked", proceed, reset };
    act(() => forceRerender());
    expect(screen.getByText(/正在创建草稿，请等待创建完成后再离开/)).toBeInTheDocument();
    const leaveButton = screen.getByRole("button", { name: "离开并丢弃" });
    expect(leaveButton).toBeDisabled();
    await user.click(leaveButton);
    expect(proceed).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(reset).toHaveBeenCalledTimes(1);
    resolveCreate(detail());
  });

  it("switches to preserving the draft after deferred creation and bypasses its replace", async () => {
    const user = userEvent.setup();
    const proceed = vi.fn();
    let resolveCreate: (value: RentalContractDetail) => void = () => undefined;
    const createContract = vi.fn(
      () => new Promise<RentalContractDetail>((resolve) => (resolveCreate = resolve)),
    );
    let resolver:
      | typeof idleBlocker
      | { status: "blocked"; proceed: () => void; reset: () => void } = idleBlocker;
    blockerMock.mockImplementation(() => resolver as never);
    let internalReplaceCheck: boolean | Promise<boolean> | undefined;
    const navigate = vi.fn((input: unknown) => {
      const navigation = input as { replace?: boolean; search?: { draftId?: string } };
      if (navigation.replace && navigation.search?.draftId) {
        internalReplaceCheck = latestBlockerOptions().shouldBlockFn({
          current: {} as never,
          next: {
            fullPath: "/rentals/contracts/new",
            search: navigation.search,
          } as never,
          action: "REPLACE",
        } as never);
      }
      return Promise.resolve();
    });
    const api = baseApi({ createContract });
    const { forceRerender } = renderPageWithRerender(api, { propertyId }, navigate);
    await screen.findByRole("button", { name: "创建草稿" });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));
    await waitFor(() => expect(createContract).toHaveBeenCalledTimes(1));

    resolver = { status: "blocked", proceed, reset: vi.fn() };
    act(() => forceRerender());
    expect(screen.getByRole("button", { name: "离开并丢弃" })).toBeDisabled();
    await act(async () => resolveCreate(detail()));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ search: { draftId }, replace: true }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "离开并保留草稿" })).toBeEnabled(),
    );
    expect(await internalReplaceCheck).toBe(false);
    await user.click(screen.getByRole("button", { name: "离开并保留草稿" }));
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("confirms a blocked navigation through the resolver without deleting the draft", async () => {
    const user = userEvent.setup();
    const proceed = vi.fn();
    let resolver:
      | typeof idleBlocker
      | { status: "blocked"; proceed: () => void; reset: () => void } = idleBlocker;
    blockerMock.mockImplementation(() => resolver as never);
    const api = baseApi({ contractDetail: vi.fn().mockResolvedValue(completeDetail()) });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    const note = screen.getByLabelText("备注");
    await user.type(note, "保留草稿");
    resolver = { status: "blocked", proceed, reset: vi.fn() };
    await user.type(note, " ");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "离开并保留草稿" }));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(api.updateContract).not.toHaveBeenCalled();
  });

  it("invalidates a pending confirmation before proceeding away", async () => {
    const user = userEvent.setup();
    const proceed = vi.fn();
    let resolveConfirm: (value: RentalContractDetail) => void = () => undefined;
    const confirmContract = vi.fn(
      () => new Promise<RentalContractDetail>((resolve) => (resolveConfirm = resolve)),
    );
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(completeDetail()),
      checkContractAvailability: vi.fn().mockResolvedValue({ available: true, conflicts: [] }),
      confirmContract,
    });
    let forceRerender: (() => void) | undefined;
    let resolver:
      | typeof idleBlocker
      | { status: "blocked"; proceed: () => void; reset: () => void } = idleBlocker;
    blockerMock.mockImplementation(() => resolver as never);
    const navigate = vi.fn().mockResolvedValue(undefined);
    function Harness() {
      const [, setVersion] = useState(0);
      forceRerender = () => setVersion((version) => version + 1);
      return (
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <ContractFormPage
            api={api}
            organizationId="org-a"
            permissions={[
              "rental_contracts:create",
              "rental_contracts:read",
              "rental_contracts:update",
            ]}
            canCreate
            search={{ draftId }}
            navigate={navigate as never}
          />
        </QueryClientProvider>
      );
    }
    render(<Harness />);
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "检查可用性并确认" }));
    await waitFor(() => expect(confirmContract).toHaveBeenCalledTimes(1));
    resolver = { status: "blocked", proceed, reset: vi.fn() };
    act(() => forceRerender?.());
    await user.click(screen.getByRole("button", { name: "离开并保留草稿" }));
    resolveConfirm(completeDetail({ lifecycleStatus: "confirmed", displayStatus: "active" }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("focuses the error summary and the active step heading", async () => {
    const user = userEvent.setup();
    const api = baseApi({ contractDetail: vi.fn().mockResolvedValue(completeDetail()) });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "设置合同条款" }));
    await user.clear(screen.getByLabelText("开始日期"));
    await user.click(screen.getByRole("button", { name: "保存并继续" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
  });

  it("cancels a blocked navigation, resets the resolver, and restores the edited value and focus", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    let forceRerender: (() => void) | undefined;
    let resolver:
      | typeof idleBlocker
      | { status: "blocked"; proceed: () => void; reset: () => void } = idleBlocker;
    blockerMock.mockImplementation(() => resolver as never);
    const api = baseApi({ contractDetail: vi.fn().mockResolvedValue(completeDetail()) });
    function Harness() {
      const [, setVersion] = useState(0);
      forceRerender = () => setVersion((version) => version + 1);
      return (
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <ContractFormPage
            api={api}
            organizationId="org-a"
            permissions={[
              "rental_contracts:create",
              "rental_contracts:read",
              "rental_contracts:update",
            ]}
            canCreate
            search={{ draftId }}
            navigate={vi.fn() as never}
          />
        </QueryClientProvider>
      );
    }
    render(<Harness />);
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "返回修改条款" }));
    const note = screen.getByLabelText("备注");
    await user.type(note, "保留输入");
    resolver = {
      status: "blocked",
      proceed: vi.fn(),
      reset: () => {
        reset();
        resolver = idleBlocker;
        forceRerender?.();
      },
    };
    await user.type(note, " ");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("备注")).toHaveValue("保留输入 ");
    expect(document.activeElement).toBe(screen.getByLabelText("备注"));
  });
});

describe("ContractFormPage review and confirmation", () => {
  it("checks availability before confirm and shows safe conflicts without confirming", async () => {
    const user = userEvent.setup();
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(completeDetail()),
      checkContractAvailability: vi.fn().mockResolvedValue({
        available: false,
        conflicts: [{ contractId: "other", contractNumber: "RC-2", spaceId, spaceName: "101" }],
      }),
      confirmContract: vi.fn(),
    });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "检查可用性并确认" }));
    await waitFor(() =>
      expect(api.checkContractAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ excludeContractId: draftId }),
      ),
    );
    expect(api.confirmContract).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("RC-2");
  });

  it("uses the server returned id after confirm", async () => {
    const user = userEvent.setup();
    const confirmedId = "55555555-5555-4555-8555-555555555555";
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(completeDetail()),
      checkContractAvailability: vi.fn().mockResolvedValue({ available: true, conflicts: [] }),
      confirmContract: vi.fn().mockResolvedValue(
        completeDetail({
          id: confirmedId,
          lifecycleStatus: "confirmed",
          displayStatus: "active",
        }),
      ),
    });
    const { navigate } = renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "检查可用性并确认" }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/rentals/contracts/$contractId",
        params: { contractId: confirmedId },
        replace: true,
      }),
    );
  });

  it("keeps the draft and shows the original 409 text when confirm races", async () => {
    const user = userEvent.setup();
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(completeDetail()),
      checkContractAvailability: vi.fn().mockResolvedValue({ available: true, conflicts: [] }),
      confirmContract: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "CONFLICT", "空间刚刚被其他合同占用")),
    });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "检查可用性并确认" }));
    expect(await screen.findByText("空间刚刚被其他合同占用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回修改空间" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回修改条款" })).toBeInTheDocument();
  });

  it("uses a safe generic message for an ordinary confirm failure", async () => {
    const user = userEvent.setup();
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(completeDetail()),
      checkContractAvailability: vi.fn().mockRejectedValue(new Error("SECRET_INTERNAL")),
      confirmContract: vi.fn(),
    });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "检查可用性并确认" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("操作失败，请稍后重试。");
    expect(alert).not.toHaveTextContent("SECRET_INTERNAL");
  });

  it("does not expose non-409 ApiError text during confirm", async () => {
    const user = userEvent.setup();
    const api = baseApi({
      contractDetail: vi.fn().mockResolvedValue(completeDetail()),
      checkContractAvailability: vi
        .fn()
        .mockRejectedValue(new ApiError(500, "INTERNAL", "SECRET_500")),
      confirmContract: vi.fn(),
    });
    renderPage(api, undefined, { draftId });
    await screen.findByRole("heading", { name: "复核并确认" });
    await user.click(screen.getByRole("button", { name: "检查可用性并确认" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("操作失败，请稍后重试。");
    expect(alert).not.toHaveTextContent("SECRET_500");
  });
});

describe("ContractFormPage step semantics", () => {
  it("rejects inactive tenants and keeps inline-create input after failure", async () => {
    const user = userEvent.setup();
    const values = defaultContractFormValues(propertyId);
    const onChange = vi.fn();
    const api = baseApi({
      listTenants: vi.fn().mockResolvedValue({
        items: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            type: "individual",
            name: "停用租户",
            phone: null,
            email: null,
            primaryContactName: null,
            primaryContactPhone: null,
            documentCountryCode: null,
            documentType: null,
            documentTypeOtherName: null,
            maskedDocumentNumber: null,
            isActive: false,
            contractCount: 0,
            updatedAt: "2026-08-30T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
      createTenant: vi.fn().mockRejectedValue(new Error("租户已存在")),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ContractPartiesStep
          api={api}
          organizationId="org-a"
          permissions={["rental_tenants:read", "rental_tenants:create"]}
          values={values}
          onChange={onChange}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "不可用" })).toBeDisabled();
    const input = screen.getByRole("textbox", { name: "新租户名称" });
    await user.type(input, "新租户");
    await user.click(screen.getByRole("button", { name: "新增租户" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("租户已存在");
    expect(input).toHaveValue("新租户");
  });

  it("clears hidden deposit fields on mode/type switch and previews partial calendar months", async () => {
    const user = userEvent.setup();
    const values = {
      ...defaultContractFormValues(propertyId),
      startDate: "2026-01-15",
      endDate: "2026-03-10",
      billingAnchor: "calendar_month" as const,
      paymentIntervalMonths: "1" as const,
    };
    const view = render(<ContractTermsStep values={values} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "添加押金" }));
    const deposit: ContractFormValues["deposits"][number] = {
      type: "rental",
      customName: "",
      calculationMode: "fixed_amount",
      fixedAmountText: "100",
      rentMultipleText: "",
    };
    const withDeposit: ContractFormValues = {
      ...values,
      deposits: [deposit],
    };
    view.rerender(<ContractTermsStep values={withDeposit} onChange={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("押金类型 1"), "other");
    const withOther: ContractFormValues = {
      ...withDeposit,
      deposits: [{ ...deposit, type: "other" }],
    };
    view.rerender(<ContractTermsStep values={withOther} onChange={vi.fn()} />);
    await user.click(screen.getByLabelText("租金倍数"));
    view.rerender(
      <ContractTermsStep
        values={{
          ...withOther,
          deposits: [
            {
              ...deposit,
              type: "other",
              calculationMode: "rent_multiple",
              fixedAmountText: "",
            },
          ],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByDisplayValue("100")).not.toBeInTheDocument();
    expect(calendarPreview("2026-01-15", "2026-01-15", "calendar_month", 1)).toEqual([
      "2026-01-15 至 2026-01-15",
    ]);
    expect(calendarPreview("2026-01-15", "2026-03-10", "calendar_month", 1)).toEqual([
      "2026-01-15 至 2026-01-31",
      "2026-02-01 至 2026-02-28",
      "2026-03-01 至 2026-03-10",
    ]);
  });
});
