import { describe, expect, it } from "vitest";
import {
  type OrganizationCreateValues,
  type OwnerDraft,
  organizationCreateSchema,
  toOrganizationCreateInput,
} from "./organization-create-schema";

const owner = (phone = "13800000001"): OwnerDraft => ({
  id: phone,
  phone,
  checkedPhone: phone,
  candidate: null,
  confirmed: false,
  email: "",
  initialPassword: "888888",
  epoch: 0,
});
const values = (): OrganizationCreateValues => ({
  name: "  新组织  ",
  baseCurrency: "USD",
  timezone: "Asia/Shanghai",
  contactName: "",
  contactPhone: "",
  address: "",
  owners: [owner()],
});
describe("organization create input", () => {
  it("allows multiple new owners with optional emails and editable initial passwords", () => {
    const input = values();
    input.owners.push({ ...owner("13800000002"), initialPassword: "custom-password" });
    expect(toOrganizationCreateInput(input)).toMatchObject({
      name: "新组织",
      baseCurrency: "USD",
      owners: [
        { kind: "new", phone: "13800000001", email: null, initialPassword: "888888" },
        { kind: "new", phone: "13800000002", email: null, initialPassword: "custom-password" },
      ],
    });
  });
  it("reports duplicate phone on the owner row", () => {
    const input = values();
    input.owners.push({ ...owner(), id: "second" });
    const result = organizationCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((issue) => issue.path.join(".") === "owners.1.phone")).toBe(
        true,
      );
  });
  it("requires explicit existing-account confirmation", () => {
    const input = values();
    input.owners[0] = {
      ...owner(),
      candidate: {
        userId: "11111111-1111-4111-8111-111111111111",
        phone: "13800000001",
        email: null,
        status: "active",
      },
    };
    expect(organizationCreateSchema.safeParse(input).success).toBe(false);
    input.owners[0].confirmed = true;
    expect(toOrganizationCreateInput(input).owners[0]).toEqual({
      kind: "existing",
      phone: "13800000001",
      userId: "11111111-1111-4111-8111-111111111111",
      confirmed: true,
    });
  });
  it("invalidates an old lookup after the owner phone changes", () => {
    const input = values();
    input.owners[0] = { ...owner(), phone: "13800000009" };
    expect(organizationCreateSchema.safeParse(input).success).toBe(false);
  });
});

import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import { ApiError } from "@/services/api-client";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { OrganizationCreatePage } from "./organization-create-page";

function uiHarness() {
  const session = createWebSession({
    authStore: createAuthStore({
      accessToken: "platform-token",
      currentUser: {
        id: "super",
        phone: null,
        email: null,
        status: "active",
        isSuperAdmin: true,
        initialPasswordUnchanged: true,
      },
    }),
  });
  const resolve = vi.spyOn(session.organizationsApi, "resolveOwner").mockResolvedValue(null);
  const create = vi.spyOn(session.organizationsApi, "create").mockResolvedValue({
    id: "org",
    name: "新组织",
    status: "active",
    baseCurrency: "CNY",
    timezone: "Asia/Shanghai",
    contactName: null,
    contactPhone: null,
    address: null,
    owners: [],
  });
  const onCreated = vi.fn();
  render(
    <AppProviders queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrganizationCreatePage session={session} onBack={vi.fn()} onCreated={onCreated} />
    </AppProviders>,
  );
  return { session, resolve, create, onCreated, user: userEvent.setup() };
}
async function prepareOwner(h: ReturnType<typeof uiHarness>, index = 1, phone = "13800000001") {
  await h.user.type(screen.getByLabelText(`负责人 ${index} 手机号`), phone);
  await h.user.click(
    within(screen.getByRole("group", { name: `负责人 ${index}` })).getByRole("button", {
      name: "检查账号",
    }),
  );
}
describe("organization create form", () => {
  it("creates multiple mixed owners after explicit account and immutable-field confirmation", async () => {
    const h = uiHarness();
    h.resolve.mockImplementation(async (phone) =>
      phone === "13800000002"
        ? { userId: "11111111-1111-4111-8111-111111111111", phone, email: null, status: "active" }
        : null,
    );
    await h.user.type(screen.getByLabelText("组织名称"), "新组织");
    await prepareOwner(h);
    expect(await screen.findByLabelText("负责人 1 初始密码")).toHaveValue("888888");
    await h.user.click(screen.getByRole("button", { name: "添加负责人" }));
    await prepareOwner(h, 2, "13800000002");
    await h.user.click(await screen.findByRole("checkbox", { name: "关联已有账号" }));
    expect(screen.queryByLabelText("负责人 2 初始密码")).not.toBeInTheDocument();
    await h.user.click(screen.getByRole("button", { name: "创建组织" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("永久不可修改");
    await h.user.click(screen.getByRole("button", { name: "确认创建" }));
    await waitFor(() => expect(h.onCreated).toHaveBeenCalledWith("org"));
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owners: [
          { kind: "new", phone: "13800000001", email: null, initialPassword: "888888" },
          {
            kind: "existing",
            phone: "13800000002",
            userId: "11111111-1111-4111-8111-111111111111",
            confirmed: true,
          },
        ],
      }),
    );
  });
  it("reports duplicate phones beside the second owner before confirming submission", async () => {
    const h = uiHarness();
    await h.user.type(screen.getByLabelText("组织名称"), "新组织");
    await prepareOwner(h);
    await h.user.click(screen.getByRole("button", { name: "添加负责人" }));
    await prepareOwner(h, 2);
    await h.user.click(screen.getByRole("button", { name: "创建组织" }));
    expect(
      await within(screen.getByRole("group", { name: "负责人 2" })).findByText(
        "负责人手机号不能重复",
      ),
    ).toBeVisible();
    expect(h.create).not.toHaveBeenCalled();
  });
  it("clears prior account confirmation on phone edits", async () => {
    const h = uiHarness();
    h.resolve.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      phone: "13800000001",
      email: null,
      status: "active",
    });
    await prepareOwner(h);
    const checkbox = await screen.findByRole("checkbox", { name: "关联已有账号" });
    await h.user.click(checkbox);
    expect(checkbox).toBeChecked();
    await h.user.clear(screen.getByLabelText("负责人 1 手机号"));
    await h.user.type(screen.getByLabelText("负责人 1 手机号"), "13800000009");
    expect(screen.queryByRole("checkbox", { name: "关联已有账号" })).not.toBeInTheDocument();
    await h.user.click(
      within(screen.getByRole("group", { name: "负责人 1" })).getByRole("button", {
        name: "检查账号",
      }),
    );
    expect(await screen.findByRole("checkbox", { name: "关联已有账号" })).not.toBeChecked();
  });
  it("keeps non-sensitive data on a conflict and clears the custom initial password", async () => {
    const h = uiHarness();
    h.create.mockRejectedValue(new ApiError(409, "CONFLICT", "组织名称已被使用"));
    await h.user.type(screen.getByLabelText("组织名称"), "新组织");
    await prepareOwner(h);
    const password = await screen.findByLabelText("负责人 1 初始密码");
    await h.user.clear(password);
    await h.user.type(password, "custom-password");
    await h.user.type(screen.getByLabelText("联系人"), "联系人");
    await h.user.click(screen.getByRole("button", { name: "创建组织" }));
    await h.user.click(await screen.findByRole("button", { name: "确认创建" }));
    expect(await screen.findByText(/组织名称已被使用/)).toBeVisible();
    expect(screen.getByLabelText("组织名称")).toHaveValue("新组织");
    expect(screen.getByLabelText("联系人")).toHaveValue("联系人");
    expect(password).toHaveValue("");
    expect(h.create).toHaveBeenCalledTimes(1);
  });
});
