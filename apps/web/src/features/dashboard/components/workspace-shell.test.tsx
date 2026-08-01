import { render, screen } from "@testing-library/react";
import type { AuthTokensResponse, CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { createWebSession } from "../../../services/web-session";
import { createAuthStore } from "../../../stores/auth-store";
import { WorkspaceShell } from "./workspace-shell";

const currentUserContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members.read"],
  session: { id: "session-1", clientType: "web_pc" },
};

function createSession() {
  const authStore = createAuthStore({ accessToken: "access" });
  authStore.getState().setCurrentUserContext(currentUserContext);
  const session = createWebSession({
    authStore,
    baseUrl: "http://localhost:4000",
    fetchImpl: (() => Promise.reject(new Error("Unexpected request"))) as typeof fetch,
  });
  Object.assign(session.authApi, {
    getCurrentUser: vi.fn<() => Promise<CurrentUserResponse>>(),
    listOrganizations: vi
      .fn()
      .mockResolvedValue([{ id: "org-1", name: "个人账本", status: "active" }]),
    logout: vi.fn().mockResolvedValue(undefined),
    switchOrganization: vi.fn<(organizationId: string) => Promise<AuthTokensResponse>>(),
  });

  return session;
}

describe("WorkspaceShell", () => {
  it("uses UserHeader instead of the static sidebar identity", async () => {
    render(
      <WorkspaceShell session={createSession()}>
        <main>工作区内容</main>
      </WorkspaceShell>,
    );

    expect(await screen.findByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
  });
});
