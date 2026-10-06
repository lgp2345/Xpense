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
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { BillFilters } from "./bill-filters";
import { formatBillAmount } from "./bill-format";
import { BillListCashActions } from "./bill-list-cash-actions";
export function BillsPage({
  organizationId,
  api,
  financeApi,
  permissions,
  search,
  onSearchChange,
  onNavigate,
}: {
  organizationId: string;
  api: RentalBillsApi;
  financeApi?: RentalFinanceApi;
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
        <p className="mt-2 text-sm text-muted-foreground">按条件查询账单，核对收款与退款余额</p>
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
          {query.data.totals.financial ? (
            <section className="space-y-3 rounded-lg border p-4 text-sm" aria-label="收退款汇总">
              <h2 className="font-medium">实际收退与余额</h2>
              <div className="flex flex-wrap gap-x-6 gap-y-2 tabular-nums">
                <span>累计已收 {formatBillAmount(query.data.totals.financial.receivedMinor)}</span>
                <span>累计已退 {formatBillAmount(query.data.totals.financial.refundedMinor)}</span>
                <span>待收 {formatBillAmount(query.data.totals.financial.outstandingMinor)}</span>
                <span>待退 {formatBillAmount(query.data.totals.financial.refundableMinor)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                当前筛选结果汇总。已纳入结算的收退与余额按整个合同统计。
              </p>
            </section>
          ) : null}
          {query.data.items.length ? (
            <BillListCashActions
              key={`${organizationId}:${JSON.stringify(normalized)}`}
              organizationId={organizationId}
              items={query.data.items}
              api={api}
              financeApi={financeApi}
              permissions={permissions}
              pending={query.isFetching}
              onNavigate={onNavigate}
              onUpdated={() => void query.refetch()}
            />
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
