import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { ChangePasswordPage } from "./change-password-page";

function setup(fail = false) {
  const store = createAuthStore({
    status: "authenticated",
    accessToken: "old-token",
    accessScope: "platform",
    currentUser: { id: "user", isSuperAdmin: true, initialPasswordUnchanged: true } as never,
  });
  const session = createWebSession({ authStore: store });
  const changePassword = vi.fn().mockImplementation(async () => {
    if (fail) throw Error("wrong password");
    return { accessToken: "new-token" };
  });
  Object.assign(session.authApi, {
    changePassword,
    getCurrentUser: vi.fn().mockResolvedValue({
      accessScope: "platform",
      user: { id: "user", isSuperAdmin: true, initialPasswordUnchanged: false },
      organization: null,
      role: null,
      permissions: [],
      session: { id: "new-session", clientType: "web_pc" },
    }),
  });
  render(
    <AppProviders>
      <ChangePasswordPage session={session} />
    </AppProviders>,
  );
  return { session, changePassword, store };
}
describe("change password", () => {
  it("validates confirmation without changing the session", async () => {
    const user = userEvent.setup();
    const { changePassword } = setup();
    await user.type(screen.getByLabelText("当前密码"), "old-password");
    await user.type(screen.getByLabelText("新密码"), "new-password");
    await user.type(screen.getByLabelText("确认新密码"), "different");
    await user.click(screen.getByRole("button", { name: "保存新密码" }));
    expect(await screen.findByText("两次输入的新密码不一致")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });
  it.each([
    false,
    true,
  ])("clears secrets after success and preserves authentication after rejection (fail=%s)", async (fail) => {
    const user = userEvent.setup();
    const { changePassword, store } = setup(fail);
    for (const [label, value] of [
      ["当前密码", "old-password"],
      ["新密码", "new-password"],
      ["确认新密码", "new-password"],
    ])
      await user.type(screen.getByLabelText(label as string), value as string);
    await user.click(screen.getByRole("button", { name: "保存新密码" }));
    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "new-password",
      }),
    );
    if (fail) {
      expect(await screen.findByRole("alert")).toHaveTextContent("修改密码失败");
      expect(store.getState().accessToken).toBe("old-token");
    } else {
      await waitFor(() => expect(store.getState().accessToken).toBe("new-token"));
      expect(store.getState().currentUser?.initialPasswordUnchanged).toBe(false);
      for (const name of ["当前密码", "新密码", "确认新密码"])
        expect(screen.getByLabelText(name)).toHaveValue("");
    }
  });
});
