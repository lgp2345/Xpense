import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuditLogFilters } from "@/features/audit/audit-log-filters";
import { TransactionFilters } from "@/features/bookkeeping/transactions/transaction-filters";
import { ContractFilters } from "@/features/rental/contracts/contract-filters";
import { PropertyFilters } from "@/features/rental/properties/property-filters";
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
    await user.click(screen.getByRole("button", { name: "收起筛选" }));
    expect(screen.getByRole("button", { name: "显示列" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "查询" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开筛选" }));
    expect(screen.getByRole("textbox", { name: "搜索条件" })).toHaveValue("保留内容");
    expect(submit).not.toHaveBeenCalled();
  });
  it.each([
    "审计",
    "交易",
    "合同",
    "房产",
    "租客",
  ])("%s筛选支持键盘折叠且保留输入", async (kind) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const panels = {
      审计: <AuditLogFilters search={{ action: "查询" }} onChange={onChange} />,
      交易: (
        <TransactionFilters
          search={{}}
          accounts={[]}
          categories={[]}
          ledgers={[]}
          onApply={onChange}
        />
      ),
      合同: <ContractFilters search={{}} onApply={onChange} />,
      房产: <PropertyFilters search={{}} onApply={onChange} />,
      租客: <TenantFilters search={{}} onApply={onChange} />,
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
});
