import type { RentalBillSummary } from "@xpense/shared";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { RentalBillCashBatchResult } from "../../../services/rental-bill-cash-batch";
import { formatBillAmount } from "./bill-format";
import { parseSignedMoneyMinor } from "./period-bill-form";

export function BillCashBatchReview({
  bills,
  amounts,
}: {
  bills: readonly RentalBillSummary[];
  amounts: Record<string, string>;
}) {
  const rows = bills.map((bill) => ({
    bill,
    amountMinor:
      bill.type === "deposit"
        ? (bill.financial?.outstandingMinor ?? 0)
        : (parseSignedMoneyMinor(amounts[bill.id] ?? "") ?? 0),
  }));
  const totals = new Map<string, bigint>();
  for (const { bill, amountMinor } of rows) {
    totals.set(bill.currencyCode, (totals.get(bill.currencyCode) ?? 0n) + BigInt(amountMinor));
  }
  return (
    <>
      <div className="max-h-60 space-y-2 overflow-y-auto text-sm">
        {rows.map(({ bill, amountMinor }) => (
          <p key={bill.id} className="flex flex-wrap justify-between gap-2">
            <span>{bill.billNumber}</span>
            <span className="tabular-nums">{formatBillAmount(amountMinor, bill.currencyCode)}</span>
          </p>
        ))}
      </div>
      <section
        aria-label="总共收费"
        className="flex flex-wrap items-start justify-between gap-2 border-t pt-3 text-sm font-semibold"
      >
        <span>总共收费</span>
        <div className="space-y-1 text-right tabular-nums">
          {[...totals].map(([currencyCode, total]) => (
            <p key={currencyCode}>{formatBillAmount(total, currencyCode)}</p>
          ))}
        </div>
      </section>
    </>
  );
}

export function BillCashBatchItems({
  bills,
  results,
  locked,
  renderAmount,
}: {
  bills: readonly RentalBillSummary[];
  results: RentalBillCashBatchResult[];
  locked: boolean;
  renderAmount: (bill: RentalBillSummary) => ReactNode;
}) {
  return (
    <section aria-label="所选账单" className="divide-y">
      {bills.map((bill) => {
        const result = results.find((result) => result.billId === bill.id);
        const amount = bill.financial?.outstandingMinor;
        return (
          <fieldset
            key={bill.id}
            disabled={locked}
            aria-label={bill.billNumber}
            className="min-w-0 space-y-2 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-medium">{bill.billNumber}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bill.propertyName} ·{" "}
                  {bill.type === "deposit" ? "押金" : bill.type === "period" ? "账期账单" : "租金"}
                </p>
              </div>
              {result ? (
                <Badge variant={result.state === "failed" ? "outline" : "secondary"}>
                  {result.state === "success"
                    ? "已登记收款"
                    : result.state === "failed"
                      ? result.outcomeUnknown
                        ? "结果待确认"
                        : "登记失败"
                      : "待登记"}
                </Badge>
              ) : null}
            </div>
            {bill.type !== "deposit" ? (
              renderAmount(bill)
            ) : (
              <p className="text-sm tabular-nums">
                本次押金全额收款 {formatBillAmount(amount ?? 0, bill.currencyCode)}
              </p>
            )}
            {result?.message ? (
              <p role="alert" className="text-sm text-destructive">
                {result.message}
              </p>
            ) : null}
          </fieldset>
        );
      })}
    </section>
  );
}

export function BillCashBatchSummary({ results }: { results: RentalBillCashBatchResult[] }) {
  if (!results.length) return null;
  const registered = results.filter((result) => result.state === "success").length;
  const failed = results.filter((result) => result.state === "failed").length;
  const pending = results.filter((result) => result.state === "pending").length;
  return (
    <div role="status" className="space-y-1 text-sm">
      <p>
        已登记 {registered} 笔，失败 {failed} 笔
      </p>
      {pending > 0 ? <p>待登记 {pending} 笔，恢复权限后可继续。</p> : null}
      {failed > 0 ? (
        <p className="text-xs text-muted-foreground">
          成功账单不会重复登记；结果未确认的请求沿用原请求重试。
        </p>
      ) : null}
      {results.some((result) => result.outcomeUnknown) ? (
        <p className="text-destructive">有操作结果尚未确认，请沿用原请求重试后再关闭。</p>
      ) : null}
    </div>
  );
}
