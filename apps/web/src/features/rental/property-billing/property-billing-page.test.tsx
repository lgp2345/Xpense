import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rentalPropertyBillingPermissions } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { billFixture, financeApiFixture, periodContextFixture } from "../bills/bill-test-fixtures";
import { PropertyBillingPage } from "./property-billing-page";
import {
  billingPageFixture,
  candidateFixture,
  unpaidBillFixture,
} from "./property-billing-test-fixtures";

function setup(
  overrides = {},
  permissions: (typeof rentalPropertyBillingPermissions)[number][] = [
    ...rentalPropertyBillingPermissions,
  ],
) {
  const api = financeApiFixture({
    listPropertyBilling: vi.fn().mockResolvedValue(billingPageFixture),
    generatePeriodBill: vi.fn().mockResolvedValue({
      ...billFixture,
      amountMinor: 12345,
      periodStart: "2026-10-05",
      periodEnd: "2026-11-04",
    }),
    ...overrides,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const props = {
    api,
    propertyId: "property",
    organizationId: "org",
    permissions,
    onBack: vi.fn(),
    onNavigateContract: vi.fn(),
    onNavigateBill: vi.fn(),
  };
  const view = render(
    <QueryClientProvider client={client}>
      <PropertyBillingPage {...props} />
    </QueryClientProvider>,
  );
  return {
    api,
    client,
    props,
    ...view,
    rerenderPage: (patch: Partial<typeof props>) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <PropertyBillingPage {...props} {...patch} />
        </QueryClientProvider>,
      ),
  };
}
it("空间下列出历史账单和押金，待出账行居末，合计不受折叠影响", async () => {
  const deposit = {
    ...unpaidBillFixture,
    bill: {
      ...unpaidBillFixture.bill,
      id: "deposit",
      billNumber: "RD-2026-000001",
      type: "deposit" as const,
      periodStart: null,
      periodEnd: null,
      amountMinor: 50000,
      financial: {
        ...unpaidBillFixture.bill.financial,
        receivedMinor: 0,
        outstandingMinor: 50000,
        state: "unpaid" as const,
      },
    },
  };
  const h = setup({
    listPropertyBilling: vi.fn().mockResolvedValue({
      ...billingPageFixture,
      unpaidBills: [unpaidBillFixture, deposit],
    }),
  });
  await screen.findByRole("button", { name: /生成账单 301/ });
  expect(screen.getByRole("heading", { name: "示例房产 · 账单" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "刷新列表" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
    "空间",
    "租户",
    "账单号",
    "账期",
    "总收费",
    "状态",
    "操作",
  ]);
  const billRow = screen.getByRole("row", { name: /RB-2026-000009/ });
  const spaceRow = screen.getByRole("row", { name: /301 原租户/ });
  expect(within(spaceRow).getByText("原租户")).toBeInTheDocument();
  expect(
    within(spaceRow).getAllByRole("button", {
      name: "查看合同 RC-2026-000009",
    }),
  ).toHaveLength(1);
  await userEvent.click(within(spaceRow).getByRole("button", { name: "查看合同 RC-2026-000009" }));
  expect(h.props.onNavigateContract).toHaveBeenCalledWith("old-contract");
  expect(within(billRow).queryByText("原租户")).not.toBeInTheDocument();
  expect(within(billRow).queryByText("301")).not.toBeInTheDocument();
  expect(within(billRow).queryByText("RC-2026-000009")).not.toBeInTheDocument();
  expect(within(billRow).getByText("部分收款")).toBeInTheDocument();
  expect(within(billRow).getByText("CNY 2,000.00")).toBeInTheDocument();
  expect(within(billRow).getByText("2026-09-01 至 2026-09-30")).toBeInTheDocument();
  await userEvent.click(within(billRow).getByRole("button", { name: "RB-2026-000009" }));
  expect(h.props.onNavigateBill).toHaveBeenCalledWith("old-bill");
  expect(screen.getByText("押金")).toBeInTheDocument();
  const rows = within(screen.getByRole("table")).getAllByRole("row");
  expect(rows.at(-2)).toHaveTextContent("待计算");
  expect(rows.at(-2)).toHaveTextContent("待出账");
  expect(rows.at(-2)).not.toHaveTextContent("张三");
  expect(rows.at(-2)).not.toHaveTextContent("301");
  expect(rows.at(-1)).toHaveTextContent("CNY 2,500.00");
  await userEvent.click(screen.getByRole("button", { name: "折叠 301" }));
  expect(screen.queryByRole("button", { name: "RB-2026-000009" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看合同 RC-2026-000009" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "展开 301" }));
  await userEvent.click(screen.getByRole("button", { name: "折叠 一号楼" }));
  expect(screen.queryByRole("button", { name: /生成账单 301/ })).not.toBeInTheDocument();
  expect(rows.at(-1)).toHaveTextContent("CNY 2,500.00");
});
it("没有待出账期仍显示原租户的历史未收账单", async () => {
  setup({
    listPropertyBilling: vi.fn().mockResolvedValue({
      ...billingPageFixture,
      items: [],
      unpaidBills: [unpaidBillFixture],
    }),
  });
  expect(
    await screen.findByRole("button", {
      name: unpaidBillFixture.bill.billNumber,
    }),
  ).toBeInTheDocument();
  expect(screen.queryByText("待出账")).not.toBeInTheDocument();
  expect(screen.queryByText("暂无未收账单或待出账空间")).not.toBeInTheDocument();
});
it("生成成功自动更新下一期，再次生成使用下一期表单及独立请求", async () => {
  let round = 0;
  const next = {
    ...candidateFixture,
    period: { periodStart: "2026-11-05", periodEnd: "2026-12-04" },
  };
  const list = vi.fn().mockImplementation(async () => ({
    ...billingPageFixture,
    items: round === 0 ? [candidateFixture] : round === 1 ? [next] : [],
    unpaidBills: Array.from({ length: round }, (_, i) => ({
      ...unpaidBillFixture,
      tenantNames: ["张三"],
      bill: {
        ...billFixture,
        id: `generated-${i}`,
        billNumber: `RB-NEW-${i}`,
        amountMinor: 12345,
        periodStart: i === 0 ? "2026-10-05" : "2026-11-05",
        periodEnd: i === 0 ? "2026-11-04" : "2026-12-04",
      },
    })),
  }));
  const generate = vi.fn().mockImplementation(async () => {
    const i = round++;
    return {
      ...billFixture,
      id: `generated-${i}`,
      billNumber: `RB-NEW-${i}`,
      amountMinor: 12345,
      periodStart: i === 0 ? "2026-10-05" : "2026-11-05",
      periodEnd: i === 0 ? "2026-11-04" : "2026-12-04",
    };
  });
  const h = setup({
    listPropertyBilling: list,
    generatePeriodBill: generate,
    getPeriodBillContext: vi.fn().mockImplementation(async () => ({
      ...periodContextFixture,
      nextPeriod: round === 0 ? candidateFixture.period : next.period,
      defaultDueDate: round === 0 ? "2026-10-05" : "2026-11-05",
      canSelectBillingStart: false,
    })),
  });
  for (const expected of ["2026-10-05", "2026-11-05"]) {
    await userEvent.click(await screen.findByRole("button", { name: /生成账单 301/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(generate.mock.calls.at(-1)?.[0].periodStart).toBe(expected);
    await screen.findByRole("button", { name: `RB-NEW-${round - 1}` });
  }
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /生成账单 301/ })).not.toBeInTheDocument(),
  );
  expect(generate.mock.calls[0]?.[0].idempotencyKey).not.toBe(
    generate.mock.calls[1]?.[0].idempotencyKey,
  );
  expect(screen.getByRole("row", { name: /总收费合计/ })).toHaveTextContent("CNY 246.90");
  expect(h.api.generatePeriodBill).toHaveBeenCalledTimes(2);
});
it("生成成功但列表读取失败保留结果，不再次生成旧账期，重试后恢复下一期", async () => {
  const list = vi.fn().mockResolvedValue(billingPageFixture);
  const h = setup({ listPropertyBilling: list });
  await userEvent.click(await screen.findByRole("button", { name: /生成账单 301/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  list.mockRejectedValue(new Error("offline"));
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByRole("button", { name: billFixture.billNumber })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /生成账单 301/ })).not.toBeInTheDocument();
  const next = {
    ...candidateFixture,
    period: { periodStart: "2026-11-05", periodEnd: "2026-12-04" },
  };
  list.mockResolvedValue({ ...billingPageFixture, items: [next] });
  await userEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByRole("button", { name: /生成账单 301/ })).toBeEnabled();
  expect(h.api.generatePeriodBill).toHaveBeenCalledTimes(1);
});
it("失败保持输入与待出账；其他空间仍可继续", async () => {
  setup({ generatePeriodBill: vi.fn().mockRejectedValue(new Error("network")) });
  await userEvent.click(await screen.findByRole("button", { name: /生成账单 301/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByText("确认结果暂未确认，可重试原请求。");
  expect(screen.queryByText("已生成")).not.toBeInTheDocument();
});
it("组织切换清空 Sheet 和结果", async () => {
  const h = setup();
  await userEvent.click(await screen.findByRole("button", { name: /生成账单 301/ }));
  await screen.findByLabelText("备注");
  h.rerenderPage({ organizationId: "other" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("缺权限不发候选请求", async () => {
  const h = setup({}, []);
  expect(screen.getByText("缺少房产出账权限。")).toBeInTheDocument();
  expect(h.api.listPropertyBilling).not.toHaveBeenCalled();
});
it("空、失败与重试", async () => {
  const listPropertyBilling = vi
    .fn()
    .mockRejectedValueOnce(new Error("failed"))
    .mockResolvedValue({ ...billingPageFixture, items: [] });
  setup({ listPropertyBilling });
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByText("暂无未收账单或待出账空间");
});

it("空间行的查看合同入口跳转对应合同，操作列按钮只打开 Sheet", async () => {
  const h = setup();
  const contract = await screen.findByRole("button", {
    name: "查看合同 RC-2026-000001",
  });
  expect(contract).toHaveTextContent("RC-2026-000001");
  await userEvent.click(contract);
  expect(h.props.onNavigateContract).toHaveBeenCalledWith("contract");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(h.api.getPeriodBillContext).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "生成账单 301 张三" }));
  await screen.findByLabelText("备注");
  expect(h.props.onNavigateContract).toHaveBeenCalledTimes(1);
});
