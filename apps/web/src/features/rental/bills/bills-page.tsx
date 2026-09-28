import { useQuery } from "@tanstack/react-query";
import type { ListRentalBillsQuery, PermissionKey } from "@xpense/shared";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { ApiError } from "../../../services/api-client";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import {
  normalizeRentalBillsQuery,
  rentalBillsQueryOptions,
} from "../../../services/rental-bills-query";
import { BillFilters } from "./bill-filters";
import { formatBillAmount } from "./bill-format";
import { BillTable } from "./bill-table";
export function BillsPage({
  organizationId,
  api,
  permissions,
  search,
  onSearchChange,
  onNavigate,
}: {
  organizationId: string;
  api: RentalBillsApi;
  permissions: readonly PermissionKey[];
  search: ListRentalBillsQuery;
  onSearchChange: (search: ListRentalBillsQuery) => void;
  onNavigate: (billId: string) => void;
}) {
  const read = permissions.includes("rental_bills:read");
  const normalized = normalizeRentalBillsQuery(search);
  const query = useQuery({
    ...rentalBillsQueryOptions.list(api, organizationId, normalized),
    enabled: read && Boolean(organizationId),
  });
  if (!read)
    return (
      <main className="p-4">
        <p>你没有查看账单的权限。</p>
      </main>
    );
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-bold">租赁账单</h1>
        <p className="mt-2 text-sm text-muted-foreground">本阶段仅记录应收，收款情况尚未登记</p>
      </header>
      <BillFilters key={organizationId} search={search} onChange={onSearchChange} />
      {query.isPending ? (
        <p role="status">正在读取账单…</p>
      ) : query.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {query.error instanceof ApiError && query.error.status === 403
              ? "你没有查看账单的权限。"
              : "账单读取失败，请重试。"}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 p-4 text-sm tabular-nums">
            <span>有效租金 {formatBillAmount(query.data.totals.rentAmountMinor)}</span>
            <span>有效押金 {formatBillAmount(query.data.totals.depositAmountMinor)}</span>
            <span className="text-muted-foreground">
              组织本位币 · 当前筛选全量汇总 · 作废账单不计入
            </span>
          </div>
          {query.data.items.length ? (
            <div className="min-w-0 rounded-lg border">
              <BillTable items={query.data.items} onNavigate={onNavigate} />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">没有符合条件的账单。</p>
          )}
          <Pagination
            page={normalized.page ?? 1}
            pageSize={normalized.pageSize ?? 20}
            total={query.data.total}
            pending={query.isFetching}
            onPageChange={(page) => onSearchChange({ ...search, page })}
            onPageSizeChange={(pageSize) => onSearchChange({ ...search, page: 1, pageSize })}
          />
        </>
      )}
    </main>
  );
}
