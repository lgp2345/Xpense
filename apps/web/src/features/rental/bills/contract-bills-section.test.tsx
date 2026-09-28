import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { billsApiFixture } from "./bill-test-fixtures";
import { ContractBillsSection } from "./contract-bills-section";

describe("合同应收覆盖", () => {
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
