import { useQuery } from "@tanstack/react-query";
import type { UseNavigateResult } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "../../../services/api-client";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import { rentalBillsQueryOptions } from "../../../services/rental-bills-query";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { BillCashHistory } from "./bill-cash-history";
import { BillDetailSections } from "./bill-detail-sections";
import { formatBillAmount } from "./bill-format";
import { BillReceiptDialog } from "./bill-receipt-dialog";
import { BillRevisionDialog } from "./bill-revision-dialog";
import { billDueLabel } from "./bill-table";
export function BillDetailPage({
  organizationId,
  billId,
  api,
  financeApi,
  permissions,
  navigate,
}: {
  organizationId: string;
  billId: string;
  api: RentalBillsApi;
  financeApi?: RentalFinanceApi;
  permissions: readonly PermissionKey[];
  navigate?: UseNavigateResult<"/rentals/bills/$billId">;
}) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionIntent, setRevisionIntent] = useState<"fees" | "readings">("fees");
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
        {bill.modelVersion === 2 ? null : (
          <p className="text-sm text-muted-foreground">本阶段仅记录应收，收款情况尚未登记</p>
        )}
        <div className="space-y-1 break-words text-sm text-muted-foreground">
          <p>生成批次：{bill.generationId}</p>
          {bill.type === "monthly" && bill.periodStart && bill.periodEnd ? (
            <p>
              账单费用覆盖期间：{bill.periodStart} 至 {bill.periodEnd}
            </p>
          ) : null}
          {bill.type === "rent" && bill.periodStart ? (
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
            {bill.type === "rent" ? "租金" : bill.type === "deposit" ? "押金" : "月度综合账单"} ·{" "}
            {bill.status === "active" ? "有效" : "作废"}
          </span>
          <span>
            到期日 {bill.dueDate} · {billDueLabel(bill.dueState)}
          </span>
          <span className="font-semibold tabular-nums">
            应收 {formatBillAmount(bill.amountMinor, bill.currencyCode)}
          </span>
        </div>
        {bill.modelVersion === 2 && bill.financial ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="tabular-nums">
              {bill.settlementId ? "本账单已收 " : "已收 "}
              {formatBillAmount(bill.financial.receivedMinor, bill.currencyCode)}
            </span>
            <span className="tabular-nums">
              {bill.settlementId ? "本账单已退 " : "已退 "}
              {formatBillAmount(bill.financial.refundedMinor, bill.currencyCode)}
            </span>
            {!bill.settlementId ? (
              <>
                <span className="tabular-nums">
                  待收 {formatBillAmount(bill.financial.outstandingMinor, bill.currencyCode)}
                </span>
                <span className="tabular-nums">
                  可退 {formatBillAmount(bill.financial.refundableMinor, bill.currencyCode)}
                </span>
              </>
            ) : null}
            {bill.settlementId ? (
              <>
                <span className="rounded-md border bg-muted/40 px-2 py-1">
                  已纳入退租结算（{bill.settlementId}）
                </span>
                <span className="text-muted-foreground">当前补收、退款以合同结算为准。</span>
              </>
            ) : null}
            {bill.settlementId && permissions.includes("rental_settlements:read") ? (
              <Button
                variant="outline"
                onClick={() =>
                  void navigate?.({
                    to: "/rentals/settlements/$contractId",
                    params: { contractId: bill.contractId },
                  })
                }
              >
                查看退租结算
              </Button>
            ) : null}
            {financeApi &&
            !bill.settlementId &&
            ((permissions.includes("rental_receipts:create") &&
              bill.financial.outstandingMinor > 0) ||
              (permissions.includes("rental_refunds:create") &&
                bill.financial.refundableMinor > 0)) ? (
              <Button variant="outline" onClick={() => setReceiptOpen(true)}>
                登记收退款
              </Button>
            ) : null}
            {financeApi &&
            bill.type === "monthly" &&
            bill.status === "active" &&
            permissions.includes("rental_monthly_bills:adjust") ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRevisionIntent("fees");
                    setRevisionOpen(true);
                  }}
                >
                  {bill.financial.receivedMinor === 0 ? "编辑本期费用" : "更正账单"}
                </Button>
                {bill.lines.some(
                  ({ feeSnapshot }) =>
                    feeSnapshot?.kind === "water" || feeSnapshot?.kind === "electricity",
                ) ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRevisionIntent("readings");
                      setRevisionOpen(true);
                    }}
                  >
                    更正真实读数
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </header>
      <BillDetailSections bill={bill} />
      {financeApi && bill.modelVersion === 2 ? (
        <BillCashHistory
          key={`${organizationId}:${bill.id}`}
          organizationId={organizationId}
          bill={bill}
          api={financeApi}
          permissions={permissions}
        />
      ) : null}
      {financeApi && bill.modelVersion === 2 ? (
        <>
          <BillReceiptDialog
            organizationId={organizationId}
            bill={bill}
            api={financeApi}
            permissions={permissions}
            open={receiptOpen}
            onOpenChange={setReceiptOpen}
            onUpdated={() => void query.refetch()}
          />
          <BillRevisionDialog
            key={`${organizationId}:${bill.id}`}
            organizationId={organizationId}
            bill={bill}
            api={financeApi}
            billsApi={api}
            permissions={permissions}
            open={revisionOpen}
            intent={revisionIntent}
            onOpenChange={setRevisionOpen}
            onAdjusted={() => void query.refetch()}
          />
        </>
      ) : null}
    </main>
  );
}
