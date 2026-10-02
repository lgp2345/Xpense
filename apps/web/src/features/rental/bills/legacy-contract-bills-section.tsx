import { useForm, useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey } from "@xpense/shared";
import { AlertCircle, ArrowUpRight, FileText, Plus, ReceiptText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import {
  invalidateRentalBills,
  rentalBillsQueryOptions,
} from "../../../services/rental-bills-query";
import { formatBillAmount as formatMoney } from "./bill-format";
import { BillGenerationDialog } from "./bill-generation-dialog";
import {
  ContractBillFilters,
  type ContractBillFiltersValue,
  contractBillFiltersSchema,
} from "./contract-bill-filters";

export type LegacyContractBillsSectionProps = {
  organizationId: string;
  contractId: string;
  api: RentalBillsApi;
  permissions: readonly PermissionKey[];
  canGenerate?: boolean;
  onNavigate?: (billId: string) => void;
};

export function LegacyContractBillsSection({
  organizationId,
  contractId,
  api,
  permissions,
  canGenerate = true,
  onNavigate,
}: LegacyContractBillsSectionProps) {
  const [open, setOpen] = useState(false);
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
  const coverage = query.data?.coverage;
  const showGenerate =
    canGenerate &&
    permissions.includes("rental_contracts:read") &&
    permissions.includes("rental_bills:generate");
  return (
    <Card className="@container gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <ReceiptText aria-hidden="true" className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">合同应收账单</h2>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            本阶段仅记录应收，收款情况尚未登记
          </p>
        </div>
        {showGenerate ? (
          <Button
            className="self-start active:scale-[0.98] sm:self-auto"
            onClick={() => setOpen(true)}
          >
            <Plus aria-hidden="true" />
            预览并生成
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending || list.isPending ? (
          <div role="status" className="border-y bg-muted/30 p-5">
            <span className="sr-only">正在读取账单…</span>
            <div aria-hidden="true" className="grid grid-cols-2 gap-5 @xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="space-y-3">
                  <Skeleton className="h-3 w-16 motion-reduce:animate-none" />
                  <Skeleton className="h-6 w-24 max-w-full motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </div>
        ) : query.isError || list.isError ? null : (
          <section
            aria-label="有效应收金额与账单覆盖"
            className="grid grid-cols-2 gap-5 border-y bg-muted/30 p-5 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]"
          >
            <dl className="min-w-0">
              <dt className="text-xs text-muted-foreground">有效租金</dt>
              <dd className="mt-2 break-words text-2xl font-semibold tracking-tight tabular-nums">
                {formatMoney(query.data.totals.rentAmountMinor)}
              </dd>
            </dl>
            <dl className="min-w-0 border-l pl-5">
              <dt className="text-xs text-muted-foreground">有效押金</dt>
              <dd className="mt-2 break-words text-2xl font-semibold tracking-tight tabular-nums">
                {formatMoney(query.data.totals.depositAmountMinor)}
              </dd>
            </dl>
            {coverage ? (
              <div className="col-span-2 min-w-0 space-y-2 border-t pt-4 text-sm tabular-nums @xl:col-span-1 @xl:border-t-0 @xl:border-l @xl:pt-0 @xl:pl-5">
                <p className="text-xs text-muted-foreground">账单覆盖</p>
                <p>
                  已生成租金 {coverage.existingRentCount} 期、押金 {coverage.existingDepositCount}{" "}
                  项
                </p>
                <p className="text-muted-foreground">
                  需补齐租金 {coverage.missingRentCount} 期、押金 {coverage.missingDepositCount} 项
                </p>
              </div>
            ) : null}
          </section>
        )}
        <div className="p-5">
          <ContractBillFilters
            values={filters}
            onTypeChange={(value) => form.setFieldValue("type", value)}
            onStatusChange={(value) => form.setFieldValue("status", value)}
          />
        </div>
        {query.isPending || list.isPending ? (
          <div aria-hidden="true" className="space-y-3 border-t p-5">
            <Skeleton className="h-4 w-40 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-64 max-w-full motion-reduce:animate-none" />
          </div>
        ) : query.isError || list.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t p-5">
            <div role="alert" className="flex items-start gap-3 text-sm">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium">账单读取失败。</p>
                <p className="text-xs text-muted-foreground">请重试加载账单。</p>
              </div>
            </div>
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
          <div className="border-t">
            {list.data.items.length ? (
              <ul className="divide-y px-5">
                {list.data.items.map((bill) => (
                  <li
                    className="grid gap-2 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    key={bill.id}
                  >
                    <div className="min-w-0 space-y-1.5">
                      {onNavigate ? (
                        <Button
                          variant="link"
                          className="h-auto max-w-full justify-start p-0 text-left whitespace-normal"
                          onClick={() => onNavigate(bill.id)}
                        >
                          <span className="break-all">{bill.billNumber}</span>
                          <ArrowUpRight aria-hidden="true" className="size-3.5" />
                        </Button>
                      ) : (
                        <p className="break-all font-medium">{bill.billNumber}</p>
                      )}
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {bill.type === "rent" ? "租金" : "押金"} /{" "}
                        {bill.dueDate.replaceAll("-", "/")} /{" "}
                        {bill.status === "active" ? "有效" : "作废"}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums sm:text-right">
                      {formatMoney(bill.amountMinor)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-3 p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileText aria-hidden="true" className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    {filters.status === "active"
                      ? "尚无符合条件的有效账单。"
                      : "暂无符合条件的作废历史。"}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {showGenerate && filters.status === "active"
                      ? "可通过上方“预览并生成”补齐账单。"
                      : "可调整费用或状态筛选，查看其他账单。"}
                  </p>
                </div>
              </div>
            )}
            {list.data.total > list.data.pageSize ? (
              <p className="px-5 pb-4 text-xs text-muted-foreground">
                此处显示前 {list.data.pageSize} 张，请在账单查询页查看全部。
              </p>
            ) : null}
          </div>
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
