import { useForm, useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey } from "@xpense/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganizationCurrency } from "@/features/organizations/organization-currency";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import { rentalBillsQueryOptions } from "../../../services/rental-bills-query";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { invalidateRentalFinance } from "../../../services/rental-finance-query";
import { formatBillAmount as formatMoney } from "./bill-format";
import { BillGenerationDialog } from "./bill-generation-dialog";
import {
  ContractBillFilters,
  type ContractBillFiltersValue,
  contractBillFiltersSchema,
} from "./contract-bill-filters";
import { PeriodBillDialog } from "./period-bill-dialog";

type Props = {
  organizationId: string;
  contractId: string;
  api: RentalBillsApi;
  financeApi?: RentalFinanceApi;
  permissions: readonly PermissionKey[];
  canGenerate?: boolean;
  onNavigate?: (id: string) => void;
};
export function ContractBillsSection({
  organizationId,
  contractId,
  api,
  financeApi,
  permissions,
  onNavigate,
  canGenerate: billingOpen = true,
}: Props) {
  const currencyCode = useOrganizationCurrency();

  const [open, setOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const form = useForm({
    defaultValues: { type: "all", status: "active" } as ContractBillFiltersValue,
    validators: { onChange: contractBillFiltersSchema },
  });
  const filters = useStore(form.store, (state) => state.values);
  const queryClient = useQueryClient();
  const read = permissions.includes("rental_bills:read");
  const query = useQuery({
    ...rentalBillsQueryOptions.list(api, organizationId, { contractId }),
    enabled: read && Boolean(organizationId && contractId),
  });
  const list = useQuery({
    ...rentalBillsQueryOptions.list(api, organizationId, {
      contractId,
      ...(filters.type === "all" ? {} : { type: filters.type }),
      status: filters.status,
    }),
    enabled: read && Boolean(organizationId && contractId),
  });
  if (!read) return null;
  const canGenerate =
    billingOpen &&
    Boolean(financeApi) &&
    permissions.includes("rental_contracts:read") &&
    permissions.includes("rental_period_bills:generate");
  const canGenerateDeposits =
    billingOpen &&
    permissions.includes("rental_contracts:read") &&
    permissions.includes("rental_bills:generate");
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>合同账单</CardTitle>
        <div className="flex flex-wrap gap-2">
          {canGenerateDeposits ? (
            <Button variant="outline" onClick={() => setDepositOpen(true)}>
              生成押金账单
            </Button>
          ) : null}
          {canGenerate ? <Button onClick={() => setOpen(true)}>生成下一张账单</Button> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          租金只读；电、水、固定费用与额外费用均以服务端预览为准。
        </p>
        <ContractBillFilters
          values={filters}
          onTypeChange={(value) => form.setFieldValue("type", value)}
          onStatusChange={(value) => form.setFieldValue("status", value)}
        />
        {query.isPending || list.isPending ? <p role="status">正在读取账单…</p> : null}
        {query.isError || list.isError ? (
          <div>
            <p role="alert">账单读取失败。</p>
            <Button
              variant="outline"
              onClick={() => {
                void query.refetch();
                void list.refetch();
              }}
            >
              重试
            </Button>
          </div>
        ) : null}
        {query.data && list.data ? (
          <>
            <p className="text-sm tabular-nums">
              有效普通账单{" "}
              {query.data.totals.byCurrency
                ?.map((group) => formatMoney(group.periodAmountMinor ?? 0, group.currencyCode))
                .join(" · ") ?? formatMoney(query.data.totals.periodAmountMinor ?? 0, currencyCode)}
            </p>
            {list.data.items.length ? (
              <ul className="divide-y">
                {list.data.items.map((bill) => (
                  <li
                    className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
                    key={bill.id}
                  >
                    <div className="min-w-0 space-y-1">
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
                      <p>
                        {bill.type === "deposit"
                          ? "押金"
                          : `${bill.periodStart} 至 ${bill.periodEnd}`}{" "}
                        · {bill.status === "active" ? "有效" : "作废"}
                        {bill.settlementId ? " · 已纳入退租结算" : ""}
                      </p>
                    </div>
                    <div className="space-y-1 text-right tabular-nums">
                      <p>应收 {formatMoney(bill.amountMinor, bill.currencyCode)}</p>
                      {bill.financial ? (
                        <p>
                          已收 {formatMoney(bill.financial.receivedMinor, bill.currencyCode)} · 待收{" "}
                          {formatMoney(bill.financial.outstandingMinor, bill.currencyCode)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">尚无符合条件的账期账单。</p>
            )}
          </>
        ) : null}
        {financeApi ? (
          <PeriodBillDialog
            organizationId={organizationId}
            contractId={contractId}
            api={financeApi}
            open={open}
            onOpenChange={setOpen}
            onGenerated={() => {
              void invalidateRentalFinance(queryClient, organizationId, contractId);
            }}
          />
        ) : null}
        <BillGenerationDialog
          organizationId={organizationId}
          contractId={contractId}
          api={api}
          scope="deposits"
          open={depositOpen}
          onOpenChange={setDepositOpen}
          onGenerated={() => void invalidateRentalFinance(queryClient, organizationId, contractId)}
        />
      </CardContent>
    </Card>
  );
}
