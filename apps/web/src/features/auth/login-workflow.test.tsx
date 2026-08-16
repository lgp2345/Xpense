import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "../../pages/login-page";
import { ApiError } from "../../services/api-client";
import { createWebSession } from "../../services/web-session";
import { createAuthStore } from "../../stores/auth-store";

const currentUserContext: CurrentUserResponse = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    isSuperAdmin: false,
    status: "active",
  },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members:read", "roles:read"],
  session: { id: "session-1", clientType: "web_pc" },
};

function createLoginTestSession() {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  mock.onAny().reply(() => {
    throw new Error("Unexpected request");
  });
  const session = createWebSession({
    authStore: createAuthStore(),
    baseUrl: "http://localhost:4000",
    instance,
  });

  Object.assign(session.authApi, {
    getCurrentUser: vi.fn().mockResolvedValue(currentUserContext),
    getCaptcha: vi.fn().mockResolvedValue({ captchaId: "captcha-1", svg: "<svg>mock</svg>" }),
    login: vi.fn().mockResolvedValue({ accessToken: "access-token" }),
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
  });

  return session;
}

describe("LoginPage", () => {
  it("shows Zod field errors without calling the API", async () => {
    const user = userEvent.setup();
    const session = createLoginTestSession();
    render(<LoginPage session={session} />);

    expect(screen.getByRole("complementary", { name: "产品预览" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("请输入手机号")).toBeVisible();
    expect(screen.getByText("请输入密码")).toBeVisible();
    expect(screen.getByText("请输入验证码")).toBeVisible();
    expect(session.authApi.login).not.toHaveBeenCalled();
  });

  it("shows the Zod phone-format error without calling the API", async () => {
    const user = userEvent.setup();
    const session = createLoginTestSession();
    render(<LoginPage session={session} />);

    await user.type(screen.getByRole("textbox", { name: "手机号" }), "12345");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("请输入有效的手机号")).toBeVisible();
    expect(session.authApi.login).not.toHaveBeenCalled();
  });

  it("shows a safe invalid-credential message", async () => {
    const user = userEvent.setup();
    const session = createLoginTestSession();
    vi.mocked(session.authApi.login).mockRejectedValue(
      new ApiError(401, "UNAUTHENTICATED", "internal credential lookup user_42 failed"),
    );
    render(<LoginPage session={session} />);

    await user.type(screen.getByRole("textbox", { name: "手机号" }), "13800000001");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.type(screen.getByRole("textbox", { name: "验证码" }), "abcd");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "手机号、密码或验证码不正确，请重试",
    );
    expect(screen.queryByText(/credential lookup|user_42/i)).not.toBeInTheDocument();
  });

  it("shows a rate-limit message for a 429 response", async () => {
    const user = userEvent.setup();
    const session = createLoginTestSession();
    vi.mocked(session.authApi.login).mockRejectedValue(
      new ApiError(429, "TOO_MANY_REQUESTS", "尝试过于频繁，请稍后重试"),
    );
    render(<LoginPage session={session} />);

    await user.type(screen.getByRole("textbox", { name: "手机号" }), "13800000001");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.type(screen.getByRole("textbox", { name: "验证码" }), "abcd");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("尝试过于频繁，请稍后重试");
  });

  it("submits phone and captcha and redirects only to a safe path after login", async () => {
    const user = userEvent.setup();
    const session = createLoginTestSession();
    const onAuthenticated = vi.fn();
    render(
      <LoginPage
        redirectPath="https://evil.example/steal"
        session={session}
        onAuthenticated={onAuthenticated}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "手机号" }), "13800000001");
    await user.type(screen.getByLabelText("密码"), "password");
    await user.type(screen.getByRole("textbox", { name: "验证码" }), "abcd");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith("/"));
    expect(session.authApi.login).toHaveBeenCalledWith({
      phone: "13800000001",
      password: "password",
      captchaId: "captcha-1",
      captchaText: "abcd",
      clientType: "web_pc",
    });
  });
});
