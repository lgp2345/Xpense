import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        items: [{ ...billFixture, type: input.type ?? "rent", status: input.status ?? "active" }],
        total: 1,
        page: 1,
        pageSize: 20,
        totals:
          input.status === "voided"
            ? { rentAmountMinor: 0, depositAmountMinor: 0 }
            : { rentAmountMinor: 900000, depositAmountMinor: 300000 },
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
    expect(await screen.findByText(/已生成租金 1 期、押金 2 项/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("合同账单费用"), "deposit");
    await userEvent.selectOptions(screen.getByLabelText("合同账单状态"), "voided");
    await waitFor(() =>
      expect(api.listBills).toHaveBeenLastCalledWith(
        expect.objectContaining({ contractId: "contract", type: "deposit", status: "voided" }),
      ),
    );
    expect(await screen.findByText(/押金 · 2026\/01\/01.*作废/)).toBeInTheDocument();
    expect(screen.getByText(/有效租金 9,000.00 · 押金 3,000.00/)).toBeInTheDocument();
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
    expect(await screen.findByText(/需补齐租金 3 期、押金 2 项/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预览并生成" })).not.toBeInTheDocument();
    expect(api.previewBills).not.toHaveBeenCalled();
    expect(screen.getByText("本阶段仅记录应收，收款情况尚未登记")).toBeInTheDocument();
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

  it("v2 合同显示月度账单实收余额和出账入口，不显示 legacy 未知收款提示", async () => {
    const user = userEvent.setup();
    const api = billsApiFixture({
      listBills: vi.fn().mockResolvedValue({
        items: [
          {
            ...billFixture,
            type: "monthly",
            modelVersion: 2,
            billingMonth: "2026-08",
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
        totals: { rentAmountMinor: 0, depositAmountMinor: 0, monthlyAmountMinor: 100000 },
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
          billingMode="monthly_settlement"
          permissions={[
            "rental_contracts:read",
            "rental_bills:read",
            "rental_monthly_bills:generate",
          ]}
          onNavigate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/有效月度账单 1,000.00/)).toBeInTheDocument();
    expect(screen.getByText(/已收 300.00 · 待收 700.00/)).toBeInTheDocument();
    expect(screen.queryByText(/收款情况尚未登记/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成本月账单" }));
    expect(await screen.findByRole("heading", { name: "生成本月账单" })).toBeInTheDocument();
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
          billingMode="monthly_settlement"
          permissions={["rental_contracts:read", "rental_bills:read", "rental_bills:generate"]}
        />
      </QueryClientProvider>,
    );

    await screen.findByText(/有效月度账单/);
    await userEvent.click(screen.getByRole("button", { name: "生成押金账单" }));
    expect(await screen.findByRole("heading", { name: "预览并生成押金账单" })).toBeInTheDocument();
    expect(api.previewBills).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: "deposits" }),
    );
  });

  it("月度账单生成只失效当前合同和本组织全合同列表缓存", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const api = billsApiFixture({
      previewBills: vi.fn().mockResolvedValue({
        ...previewFixture,
        missingDepositSourceKeys: [],
        canGenerate: true,
      }),
      generateBills: vi
        .fn()
        .mockResolvedValue({ ...billFixture, type: "monthly", modelVersion: 2 }),
    });
    const financeApi = financeApiFixture({
      previewMonthlyBill: vi.fn().mockResolvedValue({
        version: "preview-v1",
        canConfirm: true,
        missingFields: [],
        defaults: {
          contractId: "contract-a",
          version: "terms-v1",
          waterUnitPrice: "3",
          electricityUnitPrice: "4",
          fixedFees: [],
        },
        baselineReadings: [
          { kind: "water", readingDate: "2026-08-01", reading: "100" },
          { kind: "electricity", readingDate: "2026-08-01", reading: "200" },
        ],
        lines: [],
        amountMinor: 10000,
        billingMonth: "2026-08",
        existingBillId: null,
      }),
    });
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
          billingMode="monthly_settlement"
          permissions={[
            "rental_contracts:read",
            "rental_bills:read",
            "rental_monthly_bills:generate",
          ]}
        />
      </QueryClientProvider>,
    );
    await screen.findByText(/有效月度账单/);
    const initialListCalls = vi.mocked(api.listBills).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "生成本月账单" }));
    fireEvent.change(screen.getByLabelText("账单月份"), { target: { value: "2026-08" } });
    fireEvent.change(screen.getByLabelText("账单到期日"), { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getByLabelText("水表读数日期"), { target: { value: "2026-08-30" } });
    await user.type(screen.getByLabelText("水表读数"), "110");
    fireEvent.change(screen.getByLabelText("电表读数日期"), { target: { value: "2026-08-30" } });
    await user.type(screen.getByLabelText("电表读数"), "210");
    await screen.findByText(/服务端预览金额/);
    await user.click(screen.getByRole("button", { name: "确认生成" }));

    await waitFor(() => expect(financeApi.generateMonthlyBill).toHaveBeenCalledOnce());
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
