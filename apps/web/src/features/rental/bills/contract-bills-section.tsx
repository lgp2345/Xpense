import { useForm, useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalBillingMode } from "@xpense/shared";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import {
  invalidateRentalBills,
  rentalBillsQueryOptions,
} from "../../../services/rental-bills-query";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { invalidateRentalFinance } from "../../../services/rental-finance-query";
import { formatBillAmount as formatMoney } from "./bill-format";
import { BillGenerationDialog } from "./bill-generation-dialog";
import { MonthlyBillDialog } from "./monthly-bill-dialog";

const filtersSchema = z.object({
  type: z.enum(["all", "rent", "deposit", "monthly"]),
  status: z.enum(["active", "voided"]),
});
type Props = {
  organizationId: string;
  contractId: string;
  api: RentalBillsApi;
  permissions: readonly PermissionKey[];
  canGenerate?: boolean;
  onNavigate?: (billId: string) => void;
  billingMode?: RentalBillingMode;
  financeApi?: RentalFinanceApi;
};

export function ContractBillsSection(props: Props) {
  if (props.billingMode === "monthly_settlement" && props.financeApi)
    return <MonthlyContractBillsSection {...props} financeApi={props.financeApi} />;
  return <LegacyContractBillsSection {...props} />;
}

function LegacyContractBillsSection({
  organizationId,
  contractId,
  api,
  permissions,
  canGenerate = true,
  onNavigate,
}: Props) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    defaultValues: { type: "all", status: "active" } as z.infer<typeof filtersSchema>,
    validators: { onChange: filtersSchema },
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
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="space-y-1">
            <span className="block">合同账单费用</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={filters.type}
              onChange={(event) =>
                form.setFieldValue("type", event.target.value as typeof filters.type)
              }
            >
              <option value="all">全部费用</option>
              <option value="rent">租金</option>
              <option value="deposit">押金</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">合同账单状态</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={filters.status}
              onChange={(event) =>
                form.setFieldValue("status", event.target.value as typeof filters.status)
              }
            >
              <option value="active">有效</option>
              <option value="voided">作废历史</option>
            </select>
          </label>
        </div>
        {query.isPending || list.isPending ? (
          <p role="status">正在读取账单…</p>
        ) : query.isError || list.isError ? (
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
        ) : (
          <>
            {coverage ? (
              <div className="text-sm">
                <p>
                  已生成租金 {coverage.existingRentCount} 期、押金 {coverage.existingDepositCount}{" "}
                  项
                </p>
                <p>
                  需补齐租金 {coverage.missingRentCount} 期、押金 {coverage.missingDepositCount} 项
                </p>
              </div>
            ) : null}
            <p className="text-sm tabular-nums">
              有效租金 {formatMoney(query.data.totals.rentAmountMinor)} · 押金{" "}
              {formatMoney(query.data.totals.depositAmountMinor)}
            </p>
            {list.data.items.length ? (
              <ul className="divide-y">
                {list.data.items.map((bill) => (
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
                      · {formatMoney(bill.amountMinor)} ·{" "}
                      {bill.status === "active" ? "有效" : "作废"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {filters.status === "active"
                  ? "尚无符合条件的有效账单。"
                  : "暂无符合条件的作废历史。"}
              </p>
            )}
            {list.data.total > list.data.pageSize ? (
              <p className="text-xs text-muted-foreground">
                此处显示前 {list.data.pageSize} 张，请在账单查询页查看全部。
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

function MonthlyContractBillsSection({
  organizationId,
  contractId,
  api,
  financeApi,
  permissions,
  onNavigate,
}: Props & { financeApi: RentalFinanceApi }) {
  const [open, setOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const form = useForm({
    defaultValues: { type: "all", status: "active" } as z.infer<typeof filtersSchema>,
    validators: { onChange: filtersSchema },
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
    permissions.includes("rental_contracts:read") &&
    permissions.includes("rental_monthly_bills:generate");
  const canGenerateDeposits =
    permissions.includes("rental_contracts:read") && permissions.includes("rental_bills:generate");
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>月度综合账单</CardTitle>
        <div className="flex flex-wrap gap-2">
          {canGenerateDeposits ? (
            <Button variant="outline" onClick={() => setDepositOpen(true)}>
              生成押金账单
            </Button>
          ) : null}
          {canGenerate ? <Button onClick={() => setOpen(true)}>生成本月账单</Button> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          租金只读；电、水、固定费用与额外费用均以服务端预览为准。
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="space-y-1">
            <span className="block">账单费用</span>
            <select
              aria-label="合同账单费用"
              className="h-9 rounded-md border bg-background px-3"
              value={filters.type}
              onChange={(event) =>
                form.setFieldValue("type", event.target.value as typeof filters.type)
              }
            >
              <option value="all">全部费用</option>
              <option value="monthly">月度账单</option>
              <option value="deposit">押金</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block">账单状态</span>
            <select
              aria-label="合同账单状态"
              className="h-9 rounded-md border bg-background px-3"
              value={filters.status}
              onChange={(event) =>
                form.setFieldValue("status", event.target.value as typeof filters.status)
              }
            >
              <option value="active">有效</option>
              <option value="voided">作废历史</option>
            </select>
          </label>
        </div>
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
              有效月度账单 {formatMoney(query.data.totals.monthlyAmountMinor ?? 0)}
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
                        {bill.billingMonth ?? bill.dueDate.slice(0, 7)} ·{" "}
                        {bill.status === "active" ? "有效" : "作废"}
                        {bill.settlementId ? " · 已纳入退租结算" : ""}
                      </p>
                    </div>
                    <div className="space-y-1 text-right tabular-nums">
                      <p>应收 {formatMoney(bill.amountMinor)}</p>
                      {bill.financial ? (
                        <p>
                          已收 {formatMoney(bill.financial.receivedMinor)} · 待收{" "}
                          {formatMoney(bill.financial.outstandingMinor)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">尚无符合条件的月度账单。</p>
            )}
          </>
        ) : null}
        <MonthlyBillDialog
          organizationId={organizationId}
          contractId={contractId}
          api={financeApi}
          open={open}
          onOpenChange={setOpen}
          onGenerated={() => {
            void invalidateRentalFinance(queryClient, organizationId, contractId);
          }}
        />
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
