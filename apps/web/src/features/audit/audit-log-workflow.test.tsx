import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
import { format } from "date-fns";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AuditLogRecord, IamApi } from "../../services/iam-api";
import type { AuditLogSearch } from "./audit-log-filters";
import { AuditLogsPage } from "./audit-logs-page";

const auditLog: AuditLogRecord = {
  id: "log-1",
  organizationId: "org-1",
  actorUserId: "user-1",
  action: "role.permissions.changed",
  targetType: "role",
  targetId: "role-1",
  result: "succeeded",
  createdAt: "2026-07-04T00:00:00.000Z",
  metadata: {
    added: ["roles.update"],
    refreshToken: "must-not-render",
    nested: { access_token: "also-must-not-render" },
  },
  requestId: "request-1",
};

type AuditLogsApi = Pick<IamApi, "listAuditLogs">;

function createAuditLogsApi(overrides: Partial<AuditLogsApi> = {}): AuditLogsApi {
  return {
    listAuditLogs: vi.fn().mockResolvedValue([auditLog]),
    ...overrides,
  };
}

function renderAuditLogsPage(
  permissions: PermissionKey[],
  options: {
    api?: AuditLogsApi;
    logs?: AuditLogRecord[];
    search?: AuditLogSearch;
    onSearchChange?: (search: AuditLogSearch) => void;
  } = {},
) {
  render(
    <AuditLogsPage
      api={options.api}
      logs={options.logs}
      permissions={permissions}
      search={options.search}
      onSearchChange={options.onSearchChange}
    />,
  );
}

describe("AuditLogsPage", () => {
  it("renders audit actions and target fields without sensitive metadata", () => {
    renderAuditLogsPage(["audit_logs.read"], { logs: [auditLog] });

    expect(screen.getByText("role.permissions.changed")).toBeInTheDocument();
    expect(screen.getByText("role-1")).toBeInTheDocument();
    expect(screen.getByText(/added: 1 项/)).toBeInTheDocument();
    expect(
      screen.queryByText(/refreshToken|must-not-render|access_token|also-must-not-render/i),
    ).not.toBeInTheDocument();
  });

  it("does not request or render audit data without audit_logs.read", () => {
    const api = createAuditLogsApi();

    renderAuditLogsPage([], { api });

    expect(api.listAuditLogs).not.toHaveBeenCalled();
    expect(screen.queryByText("role.permissions.changed")).not.toBeInTheDocument();
    expect(screen.getByText("你没有查看审计日志的权限。")).toBeInTheDocument();
  });

  it("shows the empty state when no logs match", () => {
    renderAuditLogsPage(["audit_logs.read"], { logs: [] });

    expect(screen.getByText("没有匹配的审计日志。")).toBeInTheDocument();
  });

  it("shows a safe error and allows retrying a failed load", async () => {
    const user = userEvent.setup();
    const api = createAuditLogsApi({
      listAuditLogs: vi
        .fn()
        .mockRejectedValueOnce(new Error("authorization=secret"))
        .mockResolvedValueOnce([auditLog]),
    });

    render(<AuditLogsPage api={api} permissions={["audit_logs.read"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("加载审计日志失败，请稍后重试。");
    expect(screen.queryByText(/authorization=secret/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("role.permissions.changed")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("restores filters from search, preserves other values, and resets the page on change", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    function SearchHarness() {
      const [search, setSearch] = useState<AuditLogSearch>({
        action: "role.created",
        targetType: "role",
      });

      return (
        <AuditLogsPage
          logs={[]}
          permissions={["audit_logs.read"]}
          search={search}
          onSearchChange={(nextSearch) => {
            onSearchChange(nextSearch);
            setSearch(nextSearch);
          }}
        />
      );
    }

    render(<SearchHarness />);

    expect(screen.getByRole("textbox", { name: "操作" })).toHaveValue("role.created");
    expect(screen.getByRole("textbox", { name: "目标类型" })).toHaveValue("role");

    await user.clear(screen.getByRole("textbox", { name: "操作" }));
    await user.type(screen.getByRole("textbox", { name: "操作" }), "member.disabled");

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "member.disabled",
        targetType: "role",
        page: undefined,
      }),
    );
  });

  it("clears empty filter values from the search state", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    function SearchHarness() {
      const [search, setSearch] = useState<AuditLogSearch>({
        action: "role.created",
        targetType: "role",
      });

      return (
        <AuditLogsPage
          logs={[]}
          permissions={["audit_logs.read"]}
          search={search}
          onSearchChange={(nextSearch) => {
            onSearchChange(nextSearch);
            setSearch(nextSearch);
          }}
        />
      );
    }

    render(<SearchHarness />);

    await user.clear(screen.getByRole("textbox", { name: "操作" }));

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: undefined,
        targetType: "role",
        page: undefined,
      }),
    );
  });

  it("filters by a typed date and keeps the ISO value in search", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    function SearchHarness() {
      const [search, setSearch] = useState<AuditLogSearch>({
        action: "role.created",
      });

      return (
        <AuditLogsPage
          logs={[]}
          permissions={["audit_logs.read"]}
          search={search}
          onSearchChange={(nextSearch) => {
            onSearchChange(nextSearch);
            setSearch(nextSearch);
          }}
        />
      );
    }

    render(<SearchHarness />);

    await user.type(screen.getByRole("textbox", { name: "开始日期" }), "2026/08/01");

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "role.created",
        from: "2026-08-01",
        page: undefined,
      }),
    );
  });

  it("clears a date filter when its input is emptied", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    function SearchHarness() {
      const [search, setSearch] = useState<AuditLogSearch>({
        from: "2026-07-04",
      });

      return (
        <AuditLogsPage
          logs={[]}
          permissions={["audit_logs.read"]}
          search={search}
          onSearchChange={(nextSearch) => {
            onSearchChange(nextSearch);
            setSearch(nextSearch);
          }}
        />
      );
    }

    render(<SearchHarness />);

    const fromInput = screen.getByRole("textbox", { name: "开始日期" });
    expect(fromInput).toHaveValue("2026/07/04");

    await user.clear(fromInput);

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: undefined,
        page: undefined,
      }),
    );
  });

  it("selects a date from the calendar popover", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    function SearchHarness() {
      const [search, setSearch] = useState<AuditLogSearch>({});

      return (
        <AuditLogsPage
          logs={[]}
          permissions={["audit_logs.read"]}
          search={search}
          onSearchChange={(nextSearch) => {
            onSearchChange(nextSearch);
            setSearch(nextSearch);
          }}
        />
      );
    }

    render(<SearchHarness />);

    await user.click(screen.getByRole("button", { name: "选择开始日期" }));

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("data-day") === firstOfMonth.toLocaleDateString());
    expect(dayButton).toBeDefined();

    await user.click(dayButton as HTMLButtonElement);

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: format(firstOfMonth, "yyyy-MM-dd"),
        page: undefined,
      }),
    );
  });

  it("pages through the audit log list", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    function SearchHarness() {
      const [search, setSearch] = useState<AuditLogSearch>({});

      return (
        <AuditLogsPage
          logs={[auditLog]}
          permissions={["audit_logs.read"]}
          search={search}
          onSearchChange={(nextSearch) => {
            onSearchChange(nextSearch);
            setSearch(nextSearch);
          }}
        />
      );
    }

    render(<SearchHarness />);

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(onSearchChange).toHaveBeenLastCalledWith({ page: 2 });

    await user.click(screen.getByRole("button", { name: "上一页" }));
    expect(onSearchChange).toHaveBeenLastCalledWith({ page: 1 });
  });
});
