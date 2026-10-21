import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { expect, it, vi } from "vitest";
import { billFixture, financeApiFixture } from "../bills/bill-test-fixtures";
import { PeriodBillSheet } from "../bills/period-bill-sheet";

it("Activity restore retains the original unknown-result request", async () => {
  const generate = vi
    .fn()
    .mockRejectedValueOnce(new Error("unknown network result"))
    .mockResolvedValue(billFixture);
  const api = financeApiFixture({ generatePeriodBill: generate });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    organizationId: "org",
    contractId: "contract",
    api,
    open: true,
    onOpenChange: vi.fn(),
    onGenerated: vi.fn(),
    spaceLabel: "101",
    tenantNames: ["测试租户"],
    expectedPeriodStart: "2026-10-05",
  };
  const view = (mode: "visible" | "hidden") => (
    <QueryClientProvider client={client}>
      <Activity mode={mode}>
        <PeriodBillSheet {...props} />
      </Activity>
    </QueryClientProvider>
  );
  const r = render(view("visible"));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByText("确认结果暂未确认，可重试原请求。");
  r.rerender(view("hidden"));
  await act(async () => {});
  r.rerender(view("visible"));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1]?.[0]).toEqual(generate.mock.calls[0]?.[0]);
});

import { rentalPropertyBillingPermissions } from "@xpense/shared";
import { PropertyBillingPage } from "./property-billing-page";
import { billingPageFixture } from "./property-billing-test-fixtures";

it("completed rows retain a valid date when the hidden query has been garbage collected and reload fails", async () => {
  const list = vi.fn().mockResolvedValue(billingPageFixture);
  const api = financeApiFixture({
    listPropertyBilling: list,
    generatePeriodBill: vi
      .fn()
      .mockResolvedValue({ ...billFixture, periodStart: "2026-10-05", periodEnd: "2026-11-04" }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = {
    api,
    propertyId: "property",
    organizationId: "org",
    permissions: [...rentalPropertyBillingPermissions],
    onBack: vi.fn(),
    onNavigateContract: vi.fn(),
    onNavigateBill: vi.fn(),
  };
  const view = (mode: "visible" | "hidden") => (
    <QueryClientProvider client={client}>
      <Activity mode={mode}>
        <PropertyBillingPage {...props} />
      </Activity>
    </QueryClientProvider>
  );
  const r = render(view("visible"));
  await userEvent.click(await screen.findByRole("button", { name: /生成账单 301/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  list.mockRejectedValue(new Error("offline"));
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByRole("button", { name: billFixture.billNumber });
  list.mockRejectedValue(new Error("offline"));
  r.rerender(view("hidden"));
  await waitFor(() =>
    expect(client.getQueryData(["rental", "org", "property-billing", "property"])).toBeUndefined(),
  );
  r.rerender(view("visible"));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: billFixture.billNumber })).toBeInTheDocument();
  expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
});

it("生成后读取失败，缓存恢复成功时以新快照清除已收清账单和错误", async () => {
  const list = vi.fn().mockResolvedValue(billingPageFixture);
  const api = financeApiFixture({
    listPropertyBilling: list,
    generatePeriodBill: vi.fn().mockResolvedValue({
      ...billFixture,
      periodStart: "2026-10-05",
      periodEnd: "2026-11-04",
    }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    api,
    propertyId: "property",
    organizationId: "org",
    permissions: [...rentalPropertyBillingPermissions],
    onBack: vi.fn(),
    onNavigateContract: vi.fn(),
    onNavigateBill: vi.fn(),
  };
  const view = (mode: "visible" | "hidden") => (
    <QueryClientProvider client={client}>
      <Activity mode={mode}>
        <PropertyBillingPage {...props} />
      </Activity>
    </QueryClientProvider>
  );
  const r = render(view("visible"));
  await userEvent.click(await screen.findByRole("button", { name: /生成账单 301/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  list.mockRejectedValue(new Error("offline"));
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByRole("alert");
  r.rerender(view("hidden"));
  list.mockResolvedValue({
    ...billingPageFixture,
    items: [
      {
        ...billingPageFixture.items[0],
        period: { periodStart: "2026-11-05", periodEnd: "2026-12-04" },
      },
    ],
  });
  r.rerender(view("visible"));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: billFixture.billNumber })).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成账单 301/ })).toBeEnabled();
  expect(screen.getByRole("row", { name: /总收费合计/ })).toHaveTextContent("0.00");
});
