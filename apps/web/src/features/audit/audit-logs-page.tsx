import { type ColumnVisibilityState, useTable } from "@tanstack/react-table";
import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";
import { DataTableViewOptions } from "@/components/data-table/view-options";
import { ListPageSkeleton } from "@/components/list-loading-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import type { AuditLogRecord, IamApi, ListAuditLogsQuery } from "../../services/iam-api";
import { webIamApi } from "../../services/web-session";
import { createAuditLogColumns } from "./audit-log-columns";
import { AuditLogFilters, type AuditLogSearch } from "./audit-log-filters";
import { AuditLogTable, auditTableFeatures } from "./audit-log-table";

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
  const [retryVersion, setRetryVersion] = useState(0);

  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const table = useTable({
    features: auditTableFeatures,
    data: logItems,
    columns: createAuditLogColumns(),
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  useEffect(() => {
    if (!canRead || (hasInitialLogs && retryVersion === 0)) {
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setErrorMessage(null);

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
  }, [api, canRead, hasInitialLogs, search, retryVersion]);

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
            onClick={() => setRetryVersion((version) => version + 1)}
          >
            重试
          </Button>
        </div>
      ) : null}

      {isLoading && logItems.length === 0 ? (
        <ListPageSkeleton label="正在加载审计日志..." />
      ) : (
        <>
          <div className="flex justify-end">
            <DataTableViewOptions table={table} />
          </div>
          <AuditLogTable table={table} />
          <Pagination
            aria-label="审计日志分页"
            page={search.page ?? 1}
            pageSize={search.pageSize ?? 50}
            pending={isLoading}
            pendingLabel="加载中"
            hasNextPage={logItems.length > 0}
            onPageSizeChange={(pageSize) => onSearchChange?.({ ...search, page: 1, pageSize })}
            onPageChange={(page) => onSearchChange?.({ ...search, page })}
          />
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
    ...(search.pageSize ? { pageSize: search.pageSize } : {}),
    targetType: search.targetType,
    to: search.to ? new Date(`${search.to}T23:59:59.999Z`) : undefined,
  };
}
