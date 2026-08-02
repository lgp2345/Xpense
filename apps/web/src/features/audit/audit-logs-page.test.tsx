import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
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
    search?: {
      action?: string;
      actorUserId?: string;
      from?: string;
      targetType?: string;
      to?: string;
    };
    onSearchChange?: (search: {
      action?: string;
      actorUserId?: string;
      from?: string;
      targetType?: string;
      to?: string;
    }) => void;
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

  it("restores filters from search and updates the URL search state when a filter changes", async () => {
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

    expect(onSearchChange).toHaveBeenLastCalledWith({
      action: "member.disabled",
      targetType: "role",
    });
  });
});
