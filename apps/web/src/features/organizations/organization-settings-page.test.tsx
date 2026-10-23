import { QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { OrganizationSettingsPage } from "./organization-settings-page";

const profile = {
  id: "org-1",
  name: "锁定组织名称",
  baseCurrency: "USD",
  timezone: "Asia/Shanghai",
  status: "active",
  contactName: "联系人",
  contactPhone: "13800000001",
  address: "旧地址",
};
function setup(isSuperAdmin = false, roleKey = "owner") {
  const updateSettings = vi.fn().mockImplementation(async (input) => ({ ...profile, ...input }));
  const session = {
    authStore: createAuthStore({
      currentUser: { id: "u1", isSuperAdmin } as never,
      currentOrganization: profile as never,
      role: { key: roleKey } as never,
      permissions: ["organization_settings:read", "organization_settings:update"],
    }),
    organizationsApi: { settings: vi.fn().mockResolvedValue(profile), updateSettings },
  } as unknown as WebSessionDependency;
  render(
    <AppProviders queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrganizationSettingsPage session={session} />
    </AppProviders>,
  );
  return { updateSettings, session };
}
describe("organization settings", () => {
  it.each([
    false,
    true,
  ])("saves optional contact fields without sending immutable data (super=%s)", async (superAdmin) => {
    const user = userEvent.setup();
    const { updateSettings } = setup(superAdmin);
    expect(await screen.findByText("锁定组织名称")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "组织名称" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "联系人" }));
    await user.clear(screen.getByRole("textbox", { name: "地址" }));
    await user.click(screen.getByRole("button", { name: "保存资料" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        contactName: null,
        contactPhone: "13800000001",
        address: null,
      }),
    );
  });
  it("disallows a custom fully privileged role and reacts to losing owner identity", async () => {
    const { session } = setup();
    await screen.findByRole("button", { name: "保存资料" });
    await act(async () => {
      session.authStore.setState({ role: { key: "custom-full" } as never });
    });
    expect(
      await screen.findByText("仅组织负责人或平台超级管理员可维护组织资料。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存资料" })).not.toBeInTheDocument();
    expect(session.organizationsApi.settings).toHaveBeenCalledOnce();
  });
  it("cancels edits without submitting", async () => {
    const user = userEvent.setup();
    const { updateSettings } = setup();
    await user.clear(await screen.findByRole("textbox", { name: "联系人" }));
    await user.click(screen.getByRole("button", { name: "取消修改" }));
    expect(screen.getByRole("textbox", { name: "联系人" })).toHaveValue("联系人");
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
