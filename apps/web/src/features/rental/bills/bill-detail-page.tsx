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
import { BillDetailOverview } from "./bill-detail-overview";
import { BillDetailSections } from "./bill-detail-sections";
import { BillReceiptDialog } from "./bill-receipt-dialog";
import { BillRevisionDialog } from "./bill-revision-dialog";
import { BillSourceHistory } from "./bill-source-history";
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
  const canViewSettlement = bill.settlementId && permissions.includes("rental_settlements:read");
  const canRegisterCash =
    financeApi &&
    !bill.settlementId &&
    bill.financial &&
    ((permissions.includes("rental_receipts:create") && bill.financial.outstandingMinor > 0) ||
      (permissions.includes("rental_refunds:create") && bill.financial.refundableMinor > 0));
  const canAdjust =
    financeApi &&
    bill.type === "monthly" &&
    bill.status === "active" &&
    permissions.includes("rental_monthly_bills:adjust");
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <BillDetailOverview bill={bill} navigate={navigate}>
        {bill.modelVersion === 2 &&
        bill.financial &&
        (canViewSettlement || canRegisterCash || canAdjust) ? (
          <div className="flex flex-wrap items-center gap-2">
            {canViewSettlement ? (
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
            {canRegisterCash ? (
              <Button variant="outline" onClick={() => setReceiptOpen(true)}>
                登记收退款
              </Button>
            ) : null}
            {canAdjust ? (
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
      </BillDetailOverview>
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
      <BillSourceHistory bill={bill} navigate={navigate} />
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
