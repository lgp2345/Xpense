import type { UseNavigateResult } from "@tanstack/react-router";
import type { RentalBillDetail } from "@xpense/shared";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBillAmount } from "./bill-format";
import { billDueLabel } from "./bill-table";

export function BillDetailOverview({
  bill,
  navigate,
  children,
}: {
  bill: RentalBillDetail;
  navigate?: UseNavigateResult<"/rentals/bills/$billId">;
  children?: ReactNode;
}) {
  const financial = bill.modelVersion === 2 ? bill.financial : null;
  const metrics = financial
    ? [
        { label: bill.settlementId ? "本账单已收" : "已收", amount: financial.receivedMinor },
        { label: bill.settlementId ? "本账单已退" : "已退", amount: financial.refundedMinor },
        ...(!bill.settlementId
          ? [
              { label: "待收", amount: financial.outstandingMinor },
              { label: "可退", amount: financial.refundableMinor },
            ]
          : []),
      ]
    : [];

  return (
    <header className="space-y-4">
      <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
        <a href="/rentals/bills">
          <ArrowLeft aria-hidden="true" />
          返回账单查询
        </a>
      </Button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="break-all text-2xl font-bold">{bill.billNumber}</h1>
        <Badge variant="secondary">
          {bill.type === "rent" ? "租金" : bill.type === "deposit" ? "押金" : "月度综合账单"}
        </Badge>
        <Badge
          variant="secondary"
          className={
            bill.status === "active"
              ? "border-success/20 bg-success/10 text-success"
              : "text-muted-foreground"
          }
        >
          {bill.status === "active" ? "有效" : "作废"}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">合同</span>
          <Button asChild variant="link" className="h-auto min-w-0 p-0">
            <a
              href={`/rentals/contracts/${encodeURIComponent(bill.contractId)}`}
              onClick={(event) => {
                if (!navigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                  return;
                event.preventDefault();
                void navigate({
                  to: "/rentals/contracts/$contractId",
                  params: { contractId: bill.contractId },
                });
              }}
            >
              <span className="break-all whitespace-normal">{bill.contractNumber}</span>
              <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">到期日</span>
          <span className="tabular-nums">{bill.dueDate}</span>
          {bill.dueState ? (
            <Badge
              variant="outline"
              className={
                bill.dueState === "date_passed"
                  ? "border-destructive/20 bg-destructive/10 text-destructive"
                  : bill.dueState === "due_today"
                    ? "border-warning/20 bg-warning/10 text-warning"
                    : "text-muted-foreground"
              }
            >
              {billDueLabel(bill.dueState)}
            </Badge>
          ) : null}
        </div>
      </div>
      {bill.periodStart ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          {bill.type === "monthly" ? (
            <p>
              账单费用覆盖期间：{bill.periodStart} 至 {bill.periodEnd}
            </p>
          ) : bill.type === "rent" ? (
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
      ) : null}
      <div className="rounded-lg border bg-card text-card-foreground">
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-6">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">应收金额</p>
            <p className="break-words text-2xl font-semibold tabular-nums">
              {formatBillAmount(bill.amountMinor, bill.currencyCode)}
            </p>
          </div>
          {metrics.length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
              {metrics.map(({ label, amount }) => (
                <div key={label} className="min-w-0 space-y-1">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words text-sm font-medium tabular-nums">
                    {formatBillAmount(amount, bill.currencyCode)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : bill.modelVersion !== 2 ? (
            <p className="self-center text-sm text-muted-foreground">
              本阶段仅记录应收，收款情况尚未登记
            </p>
          ) : null}
        </div>
        {bill.settlementId && financial ? (
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 text-xs">
            <Badge variant="secondary">已纳入退租结算（{bill.settlementId}）</Badge>
            <p className="text-muted-foreground">当前补收、退款以合同结算为准。</p>
          </div>
        ) : null}
      </div>
      {children}
    </header>
  );
}
