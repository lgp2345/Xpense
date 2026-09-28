import { useQuery } from "@tanstack/react-query";
import type { PermissionKey } from "@xpense/shared";
import { Button } from "@/components/ui/button";
import { ApiError } from "../../../services/api-client";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import { rentalBillsQueryOptions } from "../../../services/rental-bills-query";
import { BillDetailSections } from "./bill-detail-sections";
import { formatBillAmount } from "./bill-format";
import { billDueLabel } from "./bill-table";
export function BillDetailPage({
  organizationId,
  billId,
  api,
  permissions,
}: {
  organizationId: string;
  billId: string;
  api: RentalBillsApi;
  permissions: readonly PermissionKey[];
}) {
  const read = permissions.includes("rental_bills:read");
  const query = useQuery({
    ...rentalBillsQueryOptions.detail(api, organizationId, billId),
    enabled: read && Boolean(organizationId && billId),
  });
  if (!read)
    return (
      <main className="p-4">
        <p>你没有查看账单的权限。</p>
      </main>
    );
  if (query.isPending)
    return (
      <main className="p-4" role="status">
        正在读取账单详情…
      </main>
    );
  if (query.isError)
    return (
      <main className="space-y-3 p-4">
        <p role="alert">
          {query.error instanceof ApiError && query.error.status === 404
            ? "账单不存在或无权访问。"
            : query.error instanceof ApiError && query.error.status === 403
              ? "你没有查看账单的权限。"
              : "账单详情读取失败，请重试。"}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          重试
        </Button>
      </main>
    );
  const bill = query.data;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2">
        <a className="text-sm underline" href="/rentals/bills">
          返回账单查询
        </a>
        <h1 className="break-words text-2xl font-bold">{bill.billNumber}</h1>
        <p className="text-sm text-muted-foreground">本阶段仅记录应收，收款情况尚未登记</p>
        <div className="space-y-1 break-words text-sm text-muted-foreground">
          <p>生成批次：{bill.generationId}</p>
          {bill.periodStart ? (
            <>
              <p>
                原付款账期：{bill.periodStart} 至 {bill.periodEnd}
              </p>
              <p>
                实际计租范围：{bill.periodStart} 至 {bill.effectiveEnd}
              </p>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            {bill.type === "rent" ? "租金" : "押金"} · {bill.status === "active" ? "有效" : "作废"}
          </span>
          <span>
            到期日 {bill.dueDate} · {billDueLabel(bill.dueState)}
          </span>
          <span className="font-semibold tabular-nums">
            应收 {formatBillAmount(bill.amountMinor, bill.currencyCode)}
          </span>
        </div>
      </header>
      <BillDetailSections bill={bill} />
    </main>
  );
}
