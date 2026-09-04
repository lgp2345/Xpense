import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalTenantDetail } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { TenantFormDialog } from "./tenant-form-dialog";

const tenant: RentalTenantDetail = {
  id: "tenant-1",
  type: "individual",
  name: "张三",
  phone: null,
  email: null,
  primaryContactName: null,
  primaryContactPhone: null,
  documentCountryCode: "CN",
  documentType: "national_id",
  documentTypeOtherName: null,
  maskedDocumentNumber: "********0011",
  isActive: true,
  contractCount: 0,
  updatedAt: "2026-08-01T00:00:00.000Z",
  note: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("TenantFormDialog", () => {
  it("shows individual identity fields and removes them when switching to company", async () => {
    const user = userEvent.setup();
    render(<TenantFormDialog mode="create" onCreate={vi.fn().mockResolvedValue(undefined)} />);
    await user.click(screen.getByRole("button", { name: "新增租客" }));
    expect(screen.getByLabelText("证件号码")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "租客类型" }));
    await user.click(screen.getByRole("option", { name: "企业" }));
    expect(screen.queryByLabelText("证件号码")).not.toBeInTheDocument();
    expect(screen.getByLabelText("主要联系人")).toBeInTheDocument();
  });

  it("keeps the masked edit form safe and submits only explicitly entered sensitive input", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<TenantFormDialog mode="edit" tenant={tenant} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: "编辑 张三" }));
    expect(screen.getByText(/\*\*\*\*\*\*\*\*0011/)).toBeInTheDocument();
    expect(screen.getByLabelText("证件号码")).toHaveValue("");
    await user.type(screen.getByLabelText("证件号码"), "110101199001010011");
    await user.click(screen.getByRole("button", { name: "保存租客" }));
    expect(await vi.waitFor(() => onUpdate)).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tenant-1", documentNumber: "110101199001010011" }),
    );
  });

  it("clears entered sensitive values across cancel and reopen", async () => {
    const user = userEvent.setup();
    render(<TenantFormDialog mode="create" onCreate={vi.fn().mockResolvedValue(undefined)} />);
    await user.click(screen.getByRole("button", { name: "新增租客" }));
    await user.type(screen.getByLabelText("租客名称"), "新租客");
    await user.type(screen.getByLabelText("证件号码"), "110101199001010011");
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: "新增租客" }));
    expect(screen.getByLabelText("租客名称")).toHaveValue("");
    expect(screen.getByLabelText("证件号码")).toHaveValue("");
  });

  it("associates select labels and exposes validation errors accessibly", async () => {
    const user = userEvent.setup();
    render(<TenantFormDialog mode="create" onCreate={vi.fn().mockResolvedValue(undefined)} />);
    await user.click(screen.getByRole("button", { name: "新增租客" }));
    expect(screen.getByLabelText("租客类型")).toHaveAttribute("id", "tenant-type");
    await user.click(screen.getByRole("button", { name: "创建租客" }));
    const name = screen.getByLabelText("租客名称");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "name-error");
    expect(screen.getByText("请输入租客名称")).toBeInTheDocument();
  });

  it("does not reload edit detail when the tenant object identity changes", async () => {
    const loadDetail = vi.fn().mockResolvedValue(tenant);
    const view = render(
      <TenantFormDialog mode="edit" open hideTrigger tenant={tenant} loadDetail={loadDetail} />,
    );
    await screen.findByLabelText("租客名称");
    view.rerender(
      <TenantFormDialog
        mode="edit"
        open
        hideTrigger
        tenant={{ ...tenant }}
        loadDetail={loadDetail}
      />,
    );
    await vi.waitFor(() => expect(loadDetail).toHaveBeenCalledTimes(1));
  });
});
