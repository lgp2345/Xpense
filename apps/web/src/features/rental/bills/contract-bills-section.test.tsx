import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { rentalBillsKeys } from "../../../services/rental-bills-query";
import {
  billFixture,
  billsApiFixture,
  financeApiFixture,
  previewFixture,
} from "./bill-test-fixtures";
import { ContractBillsSection } from "./contract-bills-section";

describe("合同应收覆盖", () => {
  it("合同内可切换押金作废历史，同时保留全部有效应收和覆盖数量", async () => {
    const api = billsApiFixture({
      listBills: vi.fn().mockImplementation(async (input) => ({
        items: [{ ...billFixture, type: input.type ?? "period", status: input.status ?? "active" }],
        total: 1,
        page: 1,
        pageSize: 20,
        totals:
          input.status === "voided"
            ? { rentAmountMinor: 0, depositAmountMinor: 0 }
            : { periodAmountMinor: 900000, rentAmountMinor: 900000, depositAmountMinor: 300000 },
        coverage: {
          existingRentCount: 1,
          existingDepositCount: 2,
          missingRentCount: 3,
          missingDepositCount: 0,
        },
      })),
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractBillsSection
          organizationId="org"
          contractId="contract"
          api={api}
          permissions={["rental_bills:read"]}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/有效普通账单 9,000.00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "合同账单费用" }));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("option", { name: "押金" }));
    await userEvent.click(screen.getByRole("combobox", { name: "合同账单状态" }));
    await userEvent.click(await screen.findByRole("option", { name: "作废历史" }));
    await waitFor(() =>
      expect(api.listBills).toHaveBeenLastCalledWith(
        expect.objectContaining({ contractId: "contract", type: "deposit", status: "voided" }),
      ),
    );
    expect(await screen.findByText(/押金.*作废/)).toBeInTheDocument();
    expect(screen.getByText(/有效普通账单 9,000.00/)).toBeInTheDocument();
  });
  it("只读用户查看缺失数量，不能发起生成预览", async () => {
    const api = billsApiFixture();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractBillsSection
          organizationId="org"
          contractId="contract"
          api={api}
          permissions={["rental_bills:read"]}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(billFixture.billNumber)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预览并生成" })).not.toBeInTheDocument();
    expect(api.previewBills).not.toHaveBeenCalled();
    expect(screen.getByText(/租金只读/)).toBeInTheDocument();
  });
  it("无 read 不请求账单", () => {
    const api = billsApiFixture();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ContractBillsSection
          organizationId="org"
          contractId="contract"
          api={api}
          permissions={[]}
        />
      </QueryClientProvider>,
    );
    expect(api.listBills).not.toHaveBeenCalled();
    expect(vi.isMockFunction(api.listBills)).toBe(true);
  });

  it("费用筛选可用键盘选择，关闭状态筛选后焦点回到控件", async () => {
    const user = userEvent.setup();
    const api = billsApiFixture();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractBillsSection
          organizationId="org"
          contractId="contract"
          api={api}
          permissions={["rental_bills:read"]}
        />
      </QueryClientProvider>,
    );
    await screen.findByText(billFixture.billNumber);
    await user.tab();
    expect(screen.getByRole("button", { name: "收起筛选" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "合同账单费用" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("option", { name: "全部费用" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("option", { name: "账期账单" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("option", { name: "押金" })).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(api.listBills).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "deposit", status: "active" }),
      ),
    );
    expect(screen.getByRole("combobox", { name: "合同账单费用" })).toHaveTextContent("押金");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "合同账单费用" })).toHaveFocus(),
    );
    await user.tab();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "合同账单状态" })).toHaveFocus(),
    );
  });

  it("空结果保留概览，合同禁止生成时不提示出账操作", async () => {
    const api = billsApiFixture({
      listBills: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totals: { periodAmountMinor: 900000, rentAmountMinor: 900000, depositAmountMinor: 300000 },
        coverage: {
          existingRentCount: 1,
          existingDepositCount: 2,
          missingRentCount: 3,
          missingDepositCount: 0,
        },
      }),
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractBillsSection
          organizationId="org"
          contractId="contract"
          api={api}
          canGenerate={false}
          permissions={["rental_bills:read", "rental_contracts:read", "rental_bills:generate"]}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("尚无符合条件的账期账单。")).toBeInTheDocument();
    expect(screen.getByText(/有效普通账单 9,000.00/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预览并生成" })).not.toBeInTheDocument();
  });

  it("账单读取失败后可重试，并打开恢复后的账单", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    let fail = true;
    const api = billsApiFixture({
      listBills: vi.fn().mockImplementation(async () => {
        if (fail) throw new Error("unavailable");
        return {
          items: [billFixture],
          total: 1,
          page: 1,
          pageSize: 20,
          totals: { periodAmountMinor: 900000, rentAmountMinor: 900000, depositAmountMinor: 0 },
        };
      }),
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractBillsSection
          organizationId="org"
          contractId="contract"
          api={api}
          permissions={["rental_bills:read"]}
          onNavigate={onNavigate}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("账单读取失败");
    fail = false;
    await user.click(screen.getByRole("button", { name: "重试" }));
    await user.click(await screen.findByRole("button", { name: billFixture.billNumber }));
    expect(onNavigate).toHaveBeenCalledWith("bill");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("v2 合同显示普通账单实收余额和出账入口，不显示 legacy 未知收款提示", async () => {
    const user = userEvent.setup();
    const api = billsApiFixture({
      listBills: vi.fn().mockResolvedValue({
        items: [
          {
            ...billFixture,
            type: "period",
            financial: {
              receivedMinor: 30000,
              refundedMinor: 0,
              netReceivedMinor: 30000,
              outstandingMinor: 70000,
              refundableMinor: 0,
              state: "partial",
              overdue: false,
              version: "cash-v1",
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totals: { rentAmountMinor: 0, depositAmountMinor: 0, periodAmountMinor: 100000 },
      }),
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractBillsSection
          organizationId="org"
          contractId="contract"
          api={api}
          financeApi={financeApiFixture()}
          permissions={[
            "rental_contracts:read",
            "rental_bills:read",
            "rental_period_bills:generate",
          ]}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/有效普通账单 1,000.00/)).toBeInTheDocument();
    expect(screen.getByText(/已收 300.00 · 待收 700.00/)).toBeInTheDocument();
    expect(screen.queryByText(/收款情况尚未登记/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "合同账单费用" }));
    expect(screen.queryByRole("option", { name: "租金" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "账期账单" }));
    await user.click(screen.getByRole("combobox", { name: "合同账单状态" }));
    await user.click(await screen.findByRole("option", { name: "作废历史" }));
    await waitFor(() =>
      expect(api.listBills).toHaveBeenLastCalledWith(
        expect.objectContaining({ contractId: "contract", type: "period", status: "voided" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "生成下一张账单" }));
    expect(await screen.findByRole("heading", { name: "生成下一张账单" })).toBeInTheDocument();
  });

  it("月度合同单独提供受 bills:generate 控制的押金出账入口", async () => {
    const api = billsApiFixture();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ContractBillsSection
          organizationId="org"
          contractId="contract"
          api={api}
          financeApi={financeApiFixture()}
          permissions={["rental_contracts:read", "rental_bills:read", "rental_bills:generate"]}
        />
      </QueryClientProvider>,
    );

    await screen.findByText(/有效普通账单/);
    await userEvent.click(screen.getByRole("button", { name: "生成押金账单" }));
    expect(await screen.findByRole("heading", { name: "预览并生成押金账单" })).toBeInTheDocument();
    expect(api.previewBills).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: "deposits" }),
    );
  });

  it("普通账单生成只失效当前合同和本组织全合同列表缓存", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const api = billsApiFixture({
      previewBills: vi.fn().mockResolvedValue({
        ...previewFixture,
        missingDepositSourceKeys: [],
        canGenerate: true,
      }),
      generateBills: vi.fn().mockResolvedValue({ ...billFixture, type: "period" }),
    });
    const financeApi = financeApiFixture();
    const cache = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totals: { rentAmountMinor: 0, depositAmountMinor: 0 },
    };
    const cacheKeys = {
      all: rentalBillsKeys.list("org", {}),
      a: rentalBillsKeys.list("org", { contractId: "contract-a" }),
      b: rentalBillsKeys.list("org", { contractId: "contract-b" }),
      otherOrg: rentalBillsKeys.list("other-org", { contractId: "contract-b" }),
      detailA: rentalBillsKeys.detail("org", "bill-a"),
      detailB: rentalBillsKeys.detail("org", "bill-b"),
    };
    for (const key of Object.values(cacheKeys))
      queryClient.setQueryData(key, { ...cache, contractId: "contract-a" });
    queryClient.setQueryData(cacheKeys.detailB, {
      ...billFixture,
      id: "bill-b",
      contractId: "contract-b",
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ContractBillsSection
          organizationId="org"
          contractId="contract-a"
          api={api}
          financeApi={financeApi}
          permissions={[
            "rental_contracts:read",
            "rental_bills:read",
            "rental_period_bills:generate",
          ]}
        />
      </QueryClientProvider>,
    );
    await screen.findByText(/有效普通账单/);
    const initialListCalls = vi.mocked(api.listBills).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "生成下一张账单" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "确认生成" }));

    await waitFor(() => expect(financeApi.generatePeriodBill).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(vi.mocked(api.listBills).mock.calls.length).toBeGreaterThan(initialListCalls),
    );
    expect(queryClient.getQueryState(cacheKeys.all)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(cacheKeys.detailA)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(cacheKeys.b)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(cacheKeys.detailB)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(cacheKeys.otherOrg)?.isInvalidated).toBe(false);
  });
});
