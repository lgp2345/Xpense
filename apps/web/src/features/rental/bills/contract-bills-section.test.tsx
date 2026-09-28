import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { billFixture, billsApiFixture } from "./bill-test-fixtures";
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
});
