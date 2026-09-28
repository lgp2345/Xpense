import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { billsApiFixture } from "./bill-test-fixtures";
import { ContractTerminationBilling } from "./contract-termination-billing";

function setup(canAdjust = true, api = billsApiFixture()) {
  const onChange = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ContractTerminationBilling
        api={api}
        organizationId="org"
        contractId="contract"
        terminationDate="2026-02-15"
        canAdjust={canAdjust}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );
  return { api, onChange };
}
describe("合同终止财务确认", () => {
  it("已有账单先取参考值，零金额和原因产生同版本确认", async () => {
    const { api, onChange } = setup();
    fireEvent.change(await screen.findByLabelText("终止当期最终应收"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("金额确认原因"), { target: { value: "协商免除" } });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        ready: true,
        confirmation: {
          expectedVersion: "termination-v1",
          finalAmountMinor: 0,
          reason: "协商免除",
        },
      }),
    );
    expect(api.previewTermination).toHaveBeenCalledWith({
      contractId: "contract",
      terminationDate: "2026-02-15",
    });
  });
  it("缺调整权限阻止确认，不请求参考", async () => {
    const { api, onChange } = setup(false);
    expect(await screen.findByText(/需要账单调整权限/)).toBeInTheDocument();
    expect(api.previewTermination).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith({ ready: false });
  });
  it("没有历史账单保留原终止流程", async () => {
    const api = billsApiFixture();
    vi.mocked(api.listBills).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 1,
      totals: { rentAmountMinor: 0, depositAmountMinor: 0 },
      coverage: null,
    });
    const { onChange } = setup(false, api);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ ready: true }));
    expect(api.previewTermination).not.toHaveBeenCalled();
  });
});
