import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuditLogFilters } from "@/features/audit/audit-log-filters";
import { BillFilters } from "@/features/rental/bills/bill-filters";
import { ContractBillFilters } from "@/features/rental/bills/contract-bill-filters";
import { ContractFilters } from "@/features/rental/contracts/contract-filters";
import { PropertyFilters } from "@/features/rental/properties/property-filters";
import { SpaceFilters } from "@/features/rental/spaces/space-filters";
import { TenantFilters } from "@/features/rental/tenants/tenant-filters";
import { FilterPanel } from "./filter-panel";

describe("筛选表单折叠", () => {
  it("收起后保留独立工具按钮且不会提交外围表单", async () => {
    const user = userEvent.setup();
    const submit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <FilterPanel actions={<button type="button">显示列</button>}>
          <input aria-label="搜索条件" defaultValue="保留内容" />
          <button type="submit">查询</button>
        </FilterPanel>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "显示列" }));
    expect(screen.getByRole("textbox", { name: "搜索条件" })).toBeVisible();
    await user.click(screen.getByText("筛选条件"));
    expect(screen.getByRole("button", { name: "显示列" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "查询" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开筛选" }));
    expect(screen.getByRole("textbox", { name: "搜索条件" })).toHaveValue("保留内容");
    expect(submit).not.toHaveBeenCalled();
  });
  it("整行标题作为折叠按钮，只显示标题和图标并支持空格键", async () => {
    const user = userEvent.setup();
    render(
      <FilterPanel>
        <input aria-label="搜索条件" />
      </FilterPanel>,
    );
    const trigger = screen.getByRole("button", { name: "收起筛选" });
    expect(trigger).toHaveTextContent("筛选条件");
    expect(trigger).not.toHaveTextContent("收起筛选");
    await user.click(screen.getByText("筛选条件"));
    expect(screen.queryByRole("textbox", { name: "搜索条件" })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    trigger.focus();
    await user.keyboard(" ");
    expect(screen.getByRole("textbox", { name: "搜索条件" })).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
  it.each([
    "审计",
    "合同",
    "房产",
    "租客",
    "空间",
    "账单",
  ])("%s筛选支持键盘折叠且保留输入", async (kind) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const panels = {
      审计: <AuditLogFilters search={{ action: "查询" }} onChange={onChange} />,
      合同: <ContractFilters search={{}} onApply={onChange} />,
      房产: <PropertyFilters search={{}} onApply={onChange} />,
      租客: <TenantFilters search={{}} onApply={onChange} />,
      空间: <SpaceFilters keyword="空间条件" onChange={onChange} />,
      账单: <BillFilters search={{}} onChange={onChange} />,
    };
    render(panels[kind as keyof typeof panels]);
    const input = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    if (kind !== "审计") await user.type(input, "测试条件");
    const value = input.value;
    onChange.mockClear();
    const collapse = screen.getByRole("button", { name: "收起筛选" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    collapse.focus();
    await user.keyboard("{Enter}");
    expect(input).not.toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const expand = screen.getByRole("button", { name: "展开筛选" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    await user.click(expand);
    expect(input).toBeVisible();
    expect(input).toHaveValue(value);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("合同账单折叠后保留费用和状态，且不触发筛选", async () => {
    const user = userEvent.setup();
    const onTypeChange = vi.fn();
    const onStatusChange = vi.fn();
    render(
      <ContractBillFilters
        values={{ type: "deposit", status: "voided" }}
        onTypeChange={onTypeChange}
        onStatusChange={onStatusChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "收起筛选" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开筛选" }));
    expect(screen.getByRole("combobox", { name: "合同账单费用" })).toHaveTextContent("押金");
    expect(screen.getByRole("combobox", { name: "合同账单状态" })).toHaveTextContent("作废历史");
    expect(onTypeChange).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
  });
  it("清空空间筛选时同时清除关键词和状态", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SpaceFilters
        keyword="401"
        effectiveStatus="active"
        leaseStatus="active"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^清空$/ }));
    expect(screen.getByRole("textbox", { name: "搜索空间" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "空间有效状态" })).toHaveTextContent(
      "全部有效状态",
    );
    expect(screen.getByRole("combobox", { name: "空间租赁状态" })).toHaveTextContent(
      "全部租赁状态",
    );
    expect(onChange).toHaveBeenCalledWith({});
  });
  it("空间筛选恢复外部条件，并通过回车提交草稿", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SpaceFilters keyword="401" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "搜索空间" });
    await user.type(input, "未应用");
    rerender(
      <SpaceFilters
        keyword=" 402 "
        effectiveStatus="inactive"
        leaseStatus="vacant"
        onChange={onChange}
      />,
    );
    expect(input).toHaveValue(" 402 ");
    expect(screen.getByRole("combobox", { name: "空间有效状态" })).toHaveTextContent("无效");
    expect(screen.getByRole("combobox", { name: "空间租赁状态" })).toHaveTextContent("空置");
    expect(onChange).not.toHaveBeenCalled();
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({
      keyword: "402",
      effectiveStatus: "inactive",
      leaseStatus: "vacant",
    });
  });
});
