import { Button } from "@heroui/react/button";
import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";

import type { AuditLogRecord, IamApi, ListAuditLogsQuery } from "../../services/iam-api";
import { webIamApi } from "../../services/web-session";
import { AuditLogFilters, type AuditLogSearch } from "./audit-log-filters";
import { AuditLogTable } from "./audit-log-table";

type AuditLogsApi = Pick<IamApi, "listAuditLogs">;

type AuditLogsPageProps = {
  api?: AuditLogsApi;
  logs?: AuditLogRecord[];
  onSearchChange?: (search: AuditLogSearch) => void;
  permissions: PermissionKey[];
  search?: AuditLogSearch;
};

export function AuditLogsPage({
  api = webIamApi,
  logs,
  onSearchChange,
  permissions,
  search = {},
}: AuditLogsPageProps) {
  const canRead = permissions.includes("audit_logs.read");
  const hasInitialLogs = logs !== undefined;
  const [logItems, setLogItems] = useState(() => logs ?? []);
  const [isLoading, setIsLoading] = useState(canRead && !hasInitialLogs);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshLogs() {
    const nextLogs = await api.listAuditLogs(toAuditLogQuery(search));
    setLogItems(nextLogs);
  }

  useEffect(() => {
    if (!canRead || hasInitialLogs) {
      return;
    }

    let isActive = true;
    setIsLoading(true);

    void api
      .listAuditLogs(toAuditLogQuery(search))
      .then((nextLogs) => {
        if (isActive) {
          setLogItems(nextLogs);
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage("加载审计日志失败，请稍后重试。");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [api, canRead, hasInitialLogs, search]);

  if (!canRead) {
    return (
      <main className="min-h-[100dvh] bg-[var(--color-canvas)] p-4 text-[var(--color-ink)] sm:p-8">
        <section className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-normal">审计日志</h1>
          <p className="mt-4 text-sm text-[var(--color-ink-muted)]">你没有查看审计日志的权限。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--color-canvas)] p-4 text-[var(--color-ink)] sm:p-8">
      <section className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-sm text-[var(--color-ink-muted)]">组织访问控制</p>
          <h1 className="mt-1 text-3xl font-normal">审计日志</h1>
        </header>

        <AuditLogFilters search={search} onChange={onSearchChange ?? (() => undefined)} />

        {errorMessage ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3" role="alert">
            <span>{errorMessage}</span>
            <Button
              variant="secondary"
              onPress={() => {
                setErrorMessage(null);
                void refreshLogs().catch(() => setErrorMessage("加载审计日志失败，请稍后重试。"));
              }}
            >
              重试
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <p aria-live="polite" className="py-10 text-sm text-[var(--color-ink-muted)]">
            正在加载审计日志...
          </p>
        ) : (
          <>
            <AuditLogTable logs={logItems} />
            <nav
              aria-label="审计日志分页"
              className="mt-4 flex items-center justify-end gap-3 text-sm text-[var(--color-ink-muted)]"
            >
              <Button
                isDisabled={(search.page ?? 1) <= 1}
                variant="secondary"
                onPress={() => onSearchChange?.({ ...search, page: (search.page ?? 1) - 1 })}
              >
                上一页
              </Button>
              <span>第 {search.page ?? 1} 页</span>
              <Button
                isDisabled={logItems.length === 0}
                variant="secondary"
                onPress={() => onSearchChange?.({ ...search, page: (search.page ?? 1) + 1 })}
              >
                下一页
              </Button>
            </nav>
          </>
        )}
      </section>
    </main>
  );
}

function toAuditLogQuery(search: AuditLogSearch): ListAuditLogsQuery {
  return {
    action: search.action,
    actorUserId: search.actorUserId,
    from: search.from ? new Date(`${search.from}T00:00:00.000Z`) : undefined,
    page: search.page ?? 1,
    targetType: search.targetType,
    to: search.to ? new Date(`${search.to}T23:59:59.999Z`) : undefined,
  };
}
