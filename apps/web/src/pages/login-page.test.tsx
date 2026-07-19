import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../services/api-client";
import { createAuthStore } from "../stores/auth-store";
import { LoginPage } from "./login-page";

const currentUserContext: CurrentUserResponse = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    isSuperAdmin: false,
    status: "active",
  },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members.read", "roles.read"],
  session: { id: "session-1", clientType: "web_pc" },
};

function createAuthApi() {
  return {
    login: vi.fn().mockResolvedValue({ accessToken: "access-token" }),
    refresh: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(currentUserContext),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

describe("LoginPage", () => {
  it("logs in as web_pc, loads /user, and stores the authenticated context", async () => {
    const user = userEvent.setup();
    const api = createAuthApi();
    const store = createAuthStore();
    const onAuthenticated = vi.fn();
    render(
      <LoginPage
        authApi={api}
        authStore={store}
        redirectPath="/roles"
        onAuthenticated={onAuthenticated}
      />,
    );

    const emailInput = screen.getByRole("textbox", { name: "邮箱" });
    const passwordInput = screen.getByLabelText("密码");
    expect(emailInput).toHaveAttribute("autocomplete", "email");
    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");

    await user.type(emailInput, "owner@example.com");
    await user.type(passwordInput, "password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith("/roles"));
    expect(api.login).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "password",
      clientType: "web_pc",
    });
    expect(api.getCurrentUser).toHaveBeenCalledWith();
    expect(store.getState()).toMatchObject({
      accessToken: "access-token",
      currentUser: currentUserContext.user,
      status: "authenticated",
    });
  });

  it("rejects external redirect targets after login", async () => {
    const user = userEvent.setup();
    const api = createAuthApi();
    const onAuthenticated = vi.fn();
    render(
      <LoginPage
        authApi={api}
        authStore={createAuthStore()}
        redirectPath="https://evil.example/steal"
        onAuthenticated={onAuthenticated}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "邮箱" }), "owner@example.com");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith("/"));
  });

  it("shows a safe failure message and clears a partial session", async () => {
    const user = userEvent.setup();
    const api = createAuthApi();
    api.getCurrentUser.mockRejectedValue(new Error("database shard user_42 failed"));
    const store = createAuthStore();
    render(<LoginPage authApi={api} authStore={store} />);

    await user.type(screen.getByRole("textbox", { name: "邮箱" }), "owner@example.com");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("服务暂时不可用，请稍后重试");
    expect(screen.queryByText(/database shard/i)).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({ accessToken: null, status: "anonymous" });
  });

  it("shows a safe invalid-credential message distinct from temporary failures", async () => {
    const user = userEvent.setup();
    const api = createAuthApi();
    api.login.mockRejectedValue(
      new ApiError(401, "UNAUTHENTICATED", "internal credential lookup user_42 failed"),
    );
    render(<LoginPage authApi={api} authStore={createAuthStore()} />);

    await user.type(screen.getByRole("textbox", { name: "邮箱" }), "owner@example.com");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码不正确，请重试");
    expect(screen.queryByText(/credential lookup|user_42/i)).not.toBeInTheDocument();
  });

  it("validates required fields and email format before calling the API", async () => {
    const user = userEvent.setup();
    const api = createAuthApi();
    render(<LoginPage authApi={api} authStore={createAuthStore()} />);

    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByText("请输入邮箱地址")).toBeInTheDocument();
    expect(screen.getByText("请输入密码")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "邮箱" }), "not-an-email");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("请输入有效的邮箱地址")).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it("shows a non-wrapping loading state while submitting", async () => {
    const user = userEvent.setup();
    const api = createAuthApi();
    api.login.mockReturnValue(new Promise(() => undefined));
    render(<LoginPage authApi={api} authStore={createAuthStore()} />);

    await user.type(screen.getByRole("textbox", { name: "邮箱" }), "owner@example.com");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    const loadingButton = await screen.findByRole("button", { name: "登录中..." });
    expect(loadingButton).toBeDisabled();
  });
});
