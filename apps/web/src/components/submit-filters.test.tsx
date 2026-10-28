import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { OrganizationFilters } from "@/features/organizations/organization-filters";
import { BillFilters } from "@/features/rental/bills/bill-filters";
import { ContractBillFilters } from "@/features/rental/bills/contract-bill-filters";
import { ContractFilters } from "@/features/rental/contracts/contract-filters";
import { PropertyFilters } from "@/features/rental/properties/property-filters";
import { TenantFilters } from "@/features/rental/tenants/tenant-filters";

it("组织条件只在查询后一次性提交，外部查询恢复字段，重置保留分页大小", async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  const { rerender } = render(
    <OrganizationFilters query={{ page: 3, pageSize: 50 }} onApply={onApply} />,
  );
  await user.type(screen.getByLabelText("组织名称"), "测试");
  await user.click(screen.getByRole("combobox", { name: "组织状态" }));
  await user.click(await screen.findByRole("option", { name: "停用" }));
  expect(onApply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(onApply).toHaveBeenLastCalledWith({
    page: 1,
    pageSize: 50,
    name: "测试",
    status: "disabled",
  });
  rerender(
    <OrganizationFilters
      query={{ page: 2, pageSize: 50, name: "外部", status: "active" }}
      onApply={onApply}
    />,
  );
  expect(screen.getByLabelText("组织名称")).toHaveValue("外部");
  await user.click(screen.getByRole("button", { name: "重置" }));
  expect(screen.getByLabelText("组织名称")).toHaveValue("");
  expect(onApply).toHaveBeenLastCalledWith({
    page: 1,
    pageSize: 50,
    name: undefined,
    status: undefined,
  });
});
it("合同内账单组合条件只在查询时提交，重置恢复有效账单", async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  render(<ContractBillFilters values={{ type: "all", status: "active" }} onApply={onApply} />);
  await user.click(screen.getByRole("combobox", { name: "合同账单费用" }));
  await user.click(await screen.findByRole("option", { name: "押金" }));
  await user.click(screen.getByRole("combobox", { name: "合同账单状态" }));
  await user.click(await screen.findByRole("option", { name: "作废历史" }));
  expect(onApply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith({ type: "deposit", status: "voided" });
  await user.click(screen.getByRole("button", { name: "重置" }));
  expect(onApply).toHaveBeenLastCalledWith({ type: "all", status: "active" });
  expect(screen.getByRole("combobox", { name: "合同账单费用" })).toHaveTextContent("全部费用");
});
it.each(["房产", "租客", "合同", "账单"])("%s未提交的关键词也能重置", async (kind) => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  const panels = {
    房产: <PropertyFilters search={{}} onApply={onApply} />,
    租客: <TenantFilters search={{}} onApply={onApply} />,
    合同: <ContractFilters search={{}} onApply={onApply} />,
    账单: <BillFilters search={{}} onChange={onApply} />,
  };
  render(panels[kind as keyof typeof panels]);
  const input = screen.getByRole("textbox", {
    name: kind === "合同" ? "合同号或外部编号" : "关键词",
  });
  await user.type(input, "未提交");
  expect(onApply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "重置" }));
  expect(input).toHaveValue("");
});
