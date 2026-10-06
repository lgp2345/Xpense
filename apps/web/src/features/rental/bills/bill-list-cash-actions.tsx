import type { PermissionKey, RentalBillSummary } from "@xpense/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RentalBillCashBatchResult } from "../../../services/rental-bill-cash-batch";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { canRegisterBillReceipt } from "./bill-cash-model";
import { BillReceiptDialog } from "./bill-receipt-dialog";
import { BillTable } from "./bill-table";

type Props = {
  organizationId: string;
  items: RentalBillSummary[];
  api: RentalBillsApi;
  financeApi?: RentalFinanceApi;
  permissions: readonly PermissionKey[];
  pending?: boolean;
  onNavigate: (billId: string) => void;
  onUpdated: () => void;
};

export function BillListCashActions(props: Props) {
  return <CashListSession key={props.organizationId} {...props} />;
}

function CashListSession({
  organizationId,
  items,
  api,
  financeApi,
  permissions,
  pending,
  onNavigate,
  onUpdated,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batch, setBatch] = useState<RentalBillSummary[] | null>(null);
  const writable = Boolean(financeApi && permissions.includes("rental_receipts:create"));
  const selectable = items.filter((bill) => canRegisterBillReceipt(bill, permissions));
  const selected = selectable.filter((bill) => selectedIds.includes(bill.id));
  return (
    <div className="min-w-0 space-y-3">
      {writable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">已选 {selected.length} 张</p>
            <p className="text-xs text-muted-foreground">
              勾选当前页有待收金额的账单后登记收款。已结清或已纳入结算的账单不参与。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || Boolean(batch)}
                onClick={() => setSelectedIds([])}
              >
                清空选择
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={pending || Boolean(batch) || selected.length === 0}
              onClick={() => setBatch(selected)}
            >
              收款（{selected.length}）
            </Button>
          </div>
        </div>
      ) : null}
      <div className="min-w-0 overflow-hidden rounded-lg border">
        <BillTable
          items={items}
          onNavigate={onNavigate}
          selection={
            writable
              ? {
                  ids: selected.map((bill) => bill.id),
                  selectableIds: pending || batch ? [] : selectable.map((bill) => bill.id),
                  onChange: setSelectedIds,
                }
              : undefined
          }
        />
      </div>
      {financeApi && batch ? (
        <BillReceiptDialog
          organizationId={organizationId}
          bills={batch}
          billsApi={api}
          api={financeApi}
          permissions={permissions}
          open
          onOpenChange={(open) => {
            if (!open) setBatch(null);
          }}
          onUpdated={(results: RentalBillCashBatchResult[]) => {
            const succeeded = new Set(
              results.filter((result) => result.state === "success").map((result) => result.billId),
            );
            setSelectedIds((ids) => ids.filter((id) => !succeeded.has(id)));
            onUpdated();
          }}
        />
      ) : null}
    </div>
  );
}
