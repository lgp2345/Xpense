import { useQuery } from "@tanstack/react-query";
import type { UseNavigateResult } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { ApiError } from "../../../services/api-client";
import type { ListRentalContractsQuery, RentalApi } from "../../../services/rental-api";
import { normalizeRentalContractsQuery, rentalQueryOptions } from "../../../services/rental-query";
import { ContractCards } from "./contract-cards";
import { ContractFilters } from "./contract-filters";
import { ContractTable } from "./contract-table";

export type ContractsPageProps = {
  api: RentalApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  search: ListRentalContractsQuery;
  navigate?: UseNavigateResult<"/rentals/contracts">;
  onSearchChange?: (search: ListRentalContractsQuery) => void;
  onNavigate?: (contractId: string) => void;
};

export function ContractsPage({
  api,
  organizationId,
  permissions,
  search,
  navigate,
  onSearchChange,
  onNavigate,
}: ContractsPageProps) {
  const canRead = permissions.includes("rental_contracts:read");
  const isMobile = useIsMobile();
  const normalizedSearch = normalizeRentalContractsQuery(search);
  const query = useQuery({
    ...rentalQueryOptions.contracts(api, organizationId, normalizedSearch),
    enabled: canRead && Boolean(organizationId),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey?.[1] === organizationId ? previousData : undefined,
  });
  const changeSearch = (next: ListRentalContractsQuery) => {
    if (onSearchChange) onSearchChange(next);
    else if (navigate) void navigate({ search: next, replace: true });
  };
  const openDetail = (id: string) => {
    if (onNavigate) onNavigate(id);
    else if (navigate)
      void navigate({
        to: "/rentals/contracts/$contractId",
        params: { contractId: id },
        search: normalizedSearch,
      });
  };
  if (!canRead)
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        <p className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
          你没有查看合同的权限。
        </p>
      </main>
    );
  const forbiddenError = query.error instanceof ApiError && query.error.status === 403;
  if (forbiddenError)
    return (
      <main className="space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader />
        <ContractFilters search={normalizedSearch} onApply={changeSearch} />
        <div role="alert" className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
          你没有查看合同的权限。
          <Button variant="link" className="ml-2 px-0" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      </main>
    );
  if (query.isPending && !query.data)
    return (
      <main className="space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader />
        <ContractFilters search={normalizedSearch} onApply={changeSearch} />
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载合同...</span>
          </CardContent>
        </Card>
      </main>
    );
  if (query.isError && !query.data)
    return (
      <main className="space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader />
        <ContractFilters search={normalizedSearch} onApply={changeSearch} />
        <QueryError error={query.error} retry={() => void query.refetch()} />
      </main>
    );
  const items = query.data?.items ?? [];
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader />
      <ContractFilters search={normalizedSearch} onApply={changeSearch} />
      {query.isError ? <QueryError error={query.error} retry={() => void query.refetch()} /> : null}
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">当前没有匹配的合同。</p>
      ) : isMobile ? (
        <ContractCards items={items} onNavigate={openDetail} />
      ) : (
        <ContractTable items={items} onNavigate={openDetail} />
      )}
      {query.isFetching ? (
        <p className="text-right text-xs text-muted-foreground" aria-live="polite">
          正在更新列表...
        </p>
      ) : null}
      {query.data && (items.length > 0 || query.data.page > 1) ? (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          pending={query.isFetching}
          search={normalizedSearch}
          onChange={changeSearch}
        />
      ) : null}
    </main>
  );
}

function PageHeader() {
  return (
    <header>
      <h1 className="text-2xl font-medium tracking-tight">合同管理</h1>
      <p className="text-sm text-muted-foreground">查看合同状态、租期和生命周期操作</p>
    </header>
  );
}
function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {error instanceof ApiError && error.status === 403
        ? "你没有查看合同的权限。"
        : "加载合同失败，请稍后重试。"}
      <Button variant="link" className="ml-2 px-0" onClick={retry}>
        重试
      </Button>
    </div>
  );
}
function Pagination({
  page,
  pageSize,
  total,
  pending,
  search,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  pending: boolean;
  search: ListRentalContractsQuery;
  onChange: (search: ListRentalContractsQuery) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span>
        第 {page} 页，共 {total} 个合同
      </span>
      <Button
        variant="outline"
        disabled={page <= 1 || pending}
        onClick={() => onChange({ ...search, page: page - 1, pageSize })}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        disabled={page * pageSize >= total || pending}
        onClick={() => onChange({ ...search, page: page + 1, pageSize })}
      >
        下一页
      </Button>
    </div>
  );
}
