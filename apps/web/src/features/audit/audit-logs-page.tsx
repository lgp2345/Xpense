import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

const EMPTY_SEARCH: AuditLogSearch = {};

export function AuditLogsPage({
  api = webIamApi,
  logs,
  onSearchChange,
  permissions,
  search = EMPTY_SEARCH,
}: AuditLogsPageProps) {
  const canRead = permissions.includes("audit_logs:read");
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
      <main className="space-y-4 p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-medium tracking-tight">审计日志</h1>
        <p className="text-sm text-muted-foreground">你没有查看审计日志的权限。</p>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">审计日志</h1>
        <p className="text-sm text-muted-foreground">组织访问控制</p>
      </header>

      <AuditLogFilters search={search} onChange={onSearchChange ?? (() => undefined)} />

      {errorMessage ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <span>{errorMessage}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setErrorMessage(null);
              void refreshLogs().catch(() => setErrorMessage("加载审计日志失败，请稍后重试。"));
            }}
          >
            重试
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载审计日志...</span>
          </CardContent>
        </Card>
      ) : (
        <>
          <AuditLogTable logs={logItems} />
          <nav
            aria-label="审计日志分页"
            className="flex items-center justify-end gap-3 text-sm text-muted-foreground"
          >
            <Button
              disabled={(search.page ?? 1) <= 1}
              size="sm"
              variant="outline"
              onClick={() => onSearchChange?.({ ...search, page: (search.page ?? 1) - 1 })}
            >
              上一页
            </Button>
            <span>第 {search.page ?? 1} 页</span>
            <Button
              disabled={logItems.length === 0}
              size="sm"
              variant="outline"
              onClick={() => onSearchChange?.({ ...search, page: (search.page ?? 1) + 1 })}
            >
              下一页
            </Button>
          </nav>
        </>
      )}
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
