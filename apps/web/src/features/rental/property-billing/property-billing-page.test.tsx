import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rentalPropertyBillingPermissions } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { billFixture, financeApiFixture } from "../bills/bill-test-fixtures";
import { PropertyBillingPage } from "./property-billing-page";
import { billingPageFixture } from "./property-billing-test-fixtures";

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
      amountMinor: 0,
      periodStart: "2026-10-05",
      periodEnd: "2026-11-04",
    }),
    ...overrides,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    api,
    propertyId: "property",
    organizationId: "org",
    permissions,
    onBack: vi.fn(),
    onNavigateContract: vi.fn(),
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
it("七列、默认展开、折叠恢复；点击只开 Sheet；成功显示响应零金额且不能重复生成", async () => {
  const url = window.location.href;
  const h = setup();
  vi.spyOn(h.client, "invalidateQueries").mockRejectedValue(new Error("refresh failed"));
  await screen.findByRole("button", { name: /生成账单 301/ });
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
    "空间",
    "租户",
    "本次账期",
    "距账期开始",
    "总收费",
    "状态",
    "操作",
  ]);
  await userEvent.click(screen.getByRole("button", { name: "折叠 一号楼" }));
  expect(screen.queryByRole("button", { name: /生成账单 301/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "展开 一号楼" }));
  const trigger = screen.getByRole("button", { name: /生成账单 301/ });
  await userEvent.click(trigger);
  await screen.findByLabelText("水表读数");
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("已生成")).toBeInTheDocument();
  expect(screen.getByText("0.00")).toBeInTheDocument();
  expect(window.location.href).toBe(url);
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(trigger);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.hover(trigger);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("本轮已生成账单");
  h.client.setQueryData(["rental", "org", "property-billing", "property"], {
    ...billingPageFixture,
    items: [],
  });
  expect(screen.getByText("已生成")).toBeInTheDocument();
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
  await screen.findByText("暂无可生成账单的空间");
});

it("空间名称跳转对应合同，操作列按钮只打开 Sheet", async () => {
  const h = setup();
  const contract = await screen.findByRole("button", { name: "查看合同 301 张三" });
  await userEvent.click(contract);
  expect(h.props.onNavigateContract).toHaveBeenCalledWith("contract");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(h.api.getPeriodBillContext).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "生成账单 301 张三" }));
  await screen.findByLabelText("备注");
  expect(h.props.onNavigateContract).toHaveBeenCalledTimes(1);
});
