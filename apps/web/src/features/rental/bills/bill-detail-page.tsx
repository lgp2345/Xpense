import { useQuery } from "@tanstack/react-query";
import type { UseNavigateResult } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { type ReactNode, useState } from "react";
import {
  SecondaryPageLayout,
  type SecondaryPageNavigation,
} from "@/components/layout/secondary-page-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "../../../services/api-client";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import { rentalBillsQueryOptions } from "../../../services/rental-bills-query";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { BillCashHistory } from "./bill-cash-history";
import { BillDetailOverview } from "./bill-detail-overview";
import { BillDetailSections } from "./bill-detail-sections";
import { BillReceiptDialog } from "./bill-receipt-dialog";
import { BillSourceHistory } from "./bill-source-history";
import { BillVoidDialog } from "./bill-void-dialog";
export function BillDetailPage({
  organizationId,
  billId,
  api,
  financeApi,
  permissions,
  navigate,
  onBack,
  breadcrumbs = [
    { key: "bills", label: "账单查询" },
    { key: "detail", label: "账单详情" },
  ],
}: SecondaryPageNavigation & {
  organizationId: string;
  billId: string;
  api: RentalBillsApi;
  financeApi?: RentalFinanceApi;
  permissions: readonly PermissionKey[];
  navigate?: UseNavigateResult<"/rentals/bills/$billId">;
}) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const read = permissions.includes("rental_bills:read");
  const query = useQuery({
    ...rentalBillsQueryOptions.detail(api, organizationId, billId),
    enabled: read && Boolean(organizationId && billId),
  });
  const bill = read && query.isSuccess ? query.data : undefined;
  const renderPage = (children: ReactNode, actions?: ReactNode) => (
    <SecondaryPageLayout
      breadcrumbs={breadcrumbs}
      title={bill?.billNumber ?? "账单详情"}
      onBack={onBack}
      status={
        bill ? (
          <>
            <Badge variant="secondary">{bill.type === "deposit" ? "押金" : "账期账单"}</Badge>
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
          </>
        ) : null
      }
      actions={actions}
    >
      {children}
    </SecondaryPageLayout>
  );
  if (!read)
    return renderPage(
      <main>
        <p>你没有查看账单的权限。</p>
      </main>,
    );
  if (query.isPending) return renderPage(<main role="status">正在读取账单详情…</main>);
  if (query.isError)
    return renderPage(
      <main className="space-y-3">
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
      </main>,
    );
  if (!bill) return null;
  const canViewSettlement = bill.settlementId && permissions.includes("rental_settlements:read");
  const canRegisterCash =
    financeApi &&
    !bill.settlementId &&
    bill.financial &&
    ((permissions.includes("rental_receipts:create") && bill.financial.outstandingMinor > 0) ||
      (permissions.includes("rental_refunds:create") && bill.financial.refundableMinor > 0));
  const canVoid = financeApi && bill.canVoid && permissions.includes("rental_period_bills:void");
  return renderPage(
    <main className="space-y-5">
      <BillDetailOverview bill={bill} navigate={navigate} />
      <BillDetailSections bill={bill} />
      {financeApi ? (
        <BillCashHistory
          key={`${organizationId}:${bill.id}`}
          organizationId={organizationId}
          bill={bill}
          api={financeApi}
          permissions={permissions}
        />
      ) : null}
      <BillSourceHistory bill={bill} navigate={navigate} />
      {financeApi ? (
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
          <BillVoidDialog
            organizationId={organizationId}
            bill={bill}
            api={financeApi}
            open={voidOpen}
            onOpenChange={setVoidOpen}
            onVoided={() => void query.refetch()}
          />
        </>
      ) : null}
    </main>,
    bill.financial && (canViewSettlement || canRegisterCash || canVoid) ? (
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
        {canVoid ? (
          <Button variant="outline" onClick={() => setVoidOpen(true)}>
            作废末期账单
          </Button>
        ) : null}
      </div>
    ) : null,
  );
}
