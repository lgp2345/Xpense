import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey } from "@xpense/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import {
  invalidateRentalBills,
  rentalBillsQueryOptions,
} from "../../../services/rental-bills-query";
import { formatBillAmount as formatMoney } from "./bill-format";
import { BillGenerationDialog } from "./bill-generation-dialog";
export function ContractBillsSection({
  organizationId,
  contractId,
  api,
  permissions,
  canGenerate = true,
  onNavigate,
}: {
  organizationId: string;
  contractId: string;
  api: RentalBillsApi;
  permissions: readonly PermissionKey[];
  canGenerate?: boolean;
  onNavigate?: (billId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const read = permissions.includes("rental_bills:read");
  const query = useQuery({
    ...rentalBillsQueryOptions.list(api, organizationId, { contractId }),
    enabled: read && Boolean(organizationId && contractId),
  });
  if (!read) return null;
  const coverage = query.data?.coverage;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>合同应收账单</CardTitle>
        {canGenerate &&
        permissions.includes("rental_contracts:read") &&
        permissions.includes("rental_bills:generate") ? (
          <Button onClick={() => setOpen(true)}>预览并生成</Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">本阶段仅记录应收，收款情况尚未登记</p>
        {query.isPending ? (
          <p role="status">正在读取账单…</p>
        ) : query.isError ? (
          <div>
            <p role="alert">账单读取失败。</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          <>
            {coverage ? (
              <p className="text-sm">
                需补齐租金 {coverage.missingRentCount} 期、押金 {coverage.missingDepositCount} 项
              </p>
            ) : null}
            <p className="text-sm tabular-nums">
              有效租金 {formatMoney(query.data.totals.rentAmountMinor)} · 押金{" "}
              {formatMoney(query.data.totals.depositAmountMinor)}
            </p>
            {query.data.items.length ? (
              <ul className="divide-y">
                {query.data.items.map((bill) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    key={bill.id}
                  >
                    {onNavigate ? (
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => onNavigate(bill.id)}
                      >
                        {bill.billNumber}
                      </Button>
                    ) : (
                      <span>{bill.billNumber}</span>
                    )}
                    <span>
                      {bill.type === "rent" ? "租金" : "押金"} · {bill.dueDate.replaceAll("-", "/")}{" "}
                      · {formatMoney(bill.amountMinor)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">尚无有效账单。</p>
            )}
            {query.data.total > query.data.pageSize ? (
              <p className="text-xs text-muted-foreground">
                此处显示前 {query.data.pageSize} 张，请在账单查询页查看全部。
              </p>
            ) : null}
          </>
        )}
        <BillGenerationDialog
          organizationId={organizationId}
          contractId={contractId}
          api={api}
          open={open}
          onOpenChange={setOpen}
          onGenerated={() => void invalidateRentalBills(queryClient, organizationId)}
        />
      </CardContent>
    </Card>
  );
}
