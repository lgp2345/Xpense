import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthApi, SessionResponse } from "../../services/auth-api";
import { SessionsPage } from "./sessions-page.js";

const currentSession = {
  id: "session-1",
  clientType: "web_pc",
  status: "active",
  lastUsedAt: null,
} satisfies Pick<SessionResponse, "id" | "clientType" | "status" | "lastUsedAt">;

const otherSession = {
  id: "session-2",
  clientType: "app_ios",
  status: "active",
  lastUsedAt: "2026-07-04T08:00:00.000Z",
} satisfies Pick<SessionResponse, "id" | "clientType" | "status" | "lastUsedAt">;

type SessionsApi = Pick<AuthApi, "listSessions" | "revokeAllSessions" | "revokeSession">;

function createSessionsApi(overrides: Partial<SessionsApi> = {}): SessionsApi {
  return {
    listSessions: vi.fn().mockResolvedValue([currentSession, otherSession]),
    revokeAllSessions: vi.fn().mockResolvedValue(undefined),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderSessionsPage(
  permissions: PermissionKey[],
  options: {
    api?: SessionsApi;
    currentSessionId?: string;
    onCurrentSessionRevoked?: () => void;
    sessions?: (typeof currentSession)[];
  } = {},
) {
  render(
    <SessionsPage
      api={options.api}
      currentSessionId={options.currentSessionId ?? "session-1"}
      onCurrentSessionRevoked={options.onCurrentSessionRevoked}
      permissions={permissions}
      sessions={options.sessions ?? [currentSession, otherSession]}
    />,
  );
}

describe("SessionsPage", () => {
  it("marks the current session", () => {
    render(
      <SessionsPage
        permissions={["sessions.read"]}
        currentSessionId="session-1"
        sessions={[{ id: "session-1", clientType: "web_pc", status: "active", lastUsedAt: null }]}
      />,
    );

    expect(screen.getByText("当前设备")).toBeInTheDocument();
  });

  it("hides revoke actions without sessions.revoke", () => {
    renderSessionsPage(["sessions.read"]);

    expect(screen.queryByRole("button", { name: "撤销 session-1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销 session-2" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销全部会话" })).not.toBeInTheDocument();
  });

  it("requires confirmation before revoking one session", async () => {
    const user = userEvent.setup();
    const api = createSessionsApi();
    renderSessionsPage(["sessions.read", "sessions.revoke"], { api });

    await user.click(screen.getByRole("button", { name: "撤销 session-2" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("确认撤销会话");
    expect(api.revokeSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认撤销" }));

    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith("session-2"));
  });

  it("requires confirmation before revoking all sessions", async () => {
    const user = userEvent.setup();
    const api = createSessionsApi();
    renderSessionsPage(["sessions.read", "sessions.revoke"], { api });

    await user.click(screen.getByRole("button", { name: "撤销全部会话" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("确认撤销全部会话");
    expect(api.revokeAllSessions).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认全部撤销" }));

    await waitFor(() => expect(api.revokeAllSessions).toHaveBeenCalledOnce());
  });

  it("ends the current local session without refreshing after its revocation succeeds", async () => {
    const user = userEvent.setup();
    const api = createSessionsApi();
    const onCurrentSessionRevoked = vi.fn();
    renderSessionsPage(["sessions.read", "sessions.revoke"], { api, onCurrentSessionRevoked });

    await user.click(screen.getByRole("button", { name: "撤销 session-1" }));
    await user.click(screen.getByRole("button", { name: "确认撤销" }));

    await waitFor(() => expect(onCurrentSessionRevoked).toHaveBeenCalledOnce());
    expect(api.revokeSession).toHaveBeenCalledWith("session-1");
    expect(api.listSessions).not.toHaveBeenCalled();
  });

  it("does not end the local session after revoking another device", async () => {
    const user = userEvent.setup();
    const api = createSessionsApi();
    const onCurrentSessionRevoked = vi.fn();
    renderSessionsPage(["sessions.read", "sessions.revoke"], { api, onCurrentSessionRevoked });

    await user.click(screen.getByRole("button", { name: "撤销 session-2" }));
    await user.click(screen.getByRole("button", { name: "确认撤销" }));

    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith("session-2"));
    expect(onCurrentSessionRevoked).not.toHaveBeenCalled();
  });

  it("ends the current local session without refreshing after revoking all sessions succeeds", async () => {
    const user = userEvent.setup();
    const api = createSessionsApi();
    const onCurrentSessionRevoked = vi.fn();
    renderSessionsPage(["sessions.read", "sessions.revoke"], { api, onCurrentSessionRevoked });

    await user.click(screen.getByRole("button", { name: "撤销全部会话" }));
    await user.click(screen.getByRole("button", { name: "确认全部撤销" }));

    await waitFor(() => expect(onCurrentSessionRevoked).toHaveBeenCalledOnce());
    expect(api.revokeAllSessions).toHaveBeenCalledOnce();
    expect(api.listSessions).not.toHaveBeenCalled();
  });

  it("reports a successful revocation separately when refreshing the list fails", async () => {
    const user = userEvent.setup();
    const api = createSessionsApi({
      listSessions: vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce([]),
    });
    renderSessionsPage(["sessions.read", "sessions.revoke"], { api });

    await user.click(screen.getByRole("button", { name: "撤销 session-2" }));
    await user.click(screen.getByRole("button", { name: "确认撤销" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "会话已撤销，但列表刷新失败，请稍后刷新。",
    );
    expect(api.revokeSession).toHaveBeenCalledWith("session-2");
    expect(screen.getByRole("button", { name: "刷新列表" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "刷新列表" }));

    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("shows a safe error and allows retrying a failed initial load", async () => {
    const user = userEvent.setup();
    const api = createSessionsApi({
      listSessions: vi
        .fn()
        .mockRejectedValueOnce(new Error("authorization=secret"))
        .mockResolvedValueOnce([currentSession]),
    });

    render(<SessionsPage api={api} currentSessionId="session-1" permissions={["sessions.read"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("加载会话列表失败，请稍后重试。");
    expect(screen.queryByText(/authorization=secret/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("当前设备")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
