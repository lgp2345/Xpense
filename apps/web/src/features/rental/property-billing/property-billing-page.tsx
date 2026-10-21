import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type PermissionKey,
  type RentalBillDetail,
  type RentalPropertyBillingCandidate,
  type RentalPropertyBillingPage,
  rentalPropertyBillingPermissions,
} from "@xpense/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SecondaryPageLayout,
  type SecondaryPageNavigation,
} from "@/components/layout/secondary-page-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { invalidateRentalFinance } from "../../../services/rental-finance-query";
import {
  loadPropertyBillingCandidates,
  propertyBillingKey,
} from "../../../services/rental-property-billing-query";
import { PeriodBillSheet } from "../bills/period-bill-sheet";
import {
  buildPropertyBillingTree,
  type CompletedPropertyBill,
  propertyBillingIdentity,
} from "./property-billing-model";
import { PropertyBillingTree } from "./property-billing-tree";

type Props = SecondaryPageNavigation & {
  propertyId: string;
  organizationId: string;
  permissions: readonly PermissionKey[];
  api: RentalFinanceApi;
  onNavigateContract: (contractId: string) => void;
  onNavigateBill: (billId: string) => void;
  onBack: () => void;
};
export function PropertyBillingPage(props: Props) {
  if (!rentalPropertyBillingPermissions.every((p) => props.permissions.includes(p)))
    return (
      <SecondaryPageLayout
        breadcrumbs={
          props.breadcrumbs ?? [
            { key: "properties", label: "房产管理" },
            { key: "billing", label: "账单" },
          ]
        }
        title="账单"
        onBack={props.onBack}
      >
        <p role="alert">缺少房产出账权限。</p>
      </SecondaryPageLayout>
    );
  return (
    <PropertyBillingWorkbench key={`${props.organizationId}:${props.propertyId}`} {...props} />
  );
}
function PropertyBillingWorkbench({
  propertyId,
  organizationId,
  api,
  onBack,
  breadcrumbs = [
    { key: "properties", label: "房产管理" },
    { key: "billing", label: "账单" },
  ],
  onNavigateContract,
  onNavigateBill,
}: Props) {
  const client = useQueryClient();
  const [completed, setCompleted] = useState<CompletedPropertyBill[]>([]);
  const [selected, setSelected] = useState<RentalPropertyBillingCandidate | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [lastPage, setLastPage] = useState<RentalPropertyBillingPage | null>(null);
  const list = useRef<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const lastSuccessfulRead = useRef(0);
  const query = useQuery({
    queryKey: propertyBillingKey(organizationId, propertyId),
    queryFn: ({ signal }) => loadPropertyBillingCandidates(api, propertyId, { signal }),
    retry: false,
    refetchOnMount: "always",
  });
  // 每次成功读取的新快照均为准，包括 Activity 恢复和窗口聚焦后的自动读取。
  useEffect(() => {
    if (query.data && query.isSuccess) {
      setLastPage(query.data);
      if (query.dataUpdatedAt !== lastSuccessfulRead.current) {
        lastSuccessfulRead.current = query.dataUpdatedAt;
        setCompleted([]);
        setRefreshError(false);
      }
    }
  }, [query.data, query.dataUpdatedAt, query.isSuccess]);
  const context = query.data ?? lastPage;
  const refetch = query.refetch;
  // Activity 恢复时重新读取服务端组织日期；本轮结果和编辑会话保留。
  useEffect(() => {
    void refetch({ cancelRefetch: false });
  }, [refetch]);
  const reload = useCallback(() => {
    setRefreshError(false);
    return refetch({ throwOnError: true })
      .then(() => {
        setCompleted([]);
      })
      .catch(() => setRefreshError(true));
  }, [refetch]);
  const close = (open: boolean) => {
    if (!open) {
      setSelected(null);
      const target = trigger.current;
      const contractId = selected?.contractId;
      requestAnimationFrame(() => {
        const next = Array.from(
          list.current?.querySelectorAll<HTMLButtonElement>("button[data-billing-contract]") ?? [],
        ).find((button) => button.dataset.billingContract === contractId);
        (next ?? (target?.isConnected ? target : list.current))?.focus();
      });
    }
  };
  const generated = (bill: RentalBillDetail) => {
    if (!selected) return;
    setCompleted((old) => [
      ...old.filter(
        (row) => propertyBillingIdentity(row.candidate) !== propertyBillingIdentity(selected),
      ),
      { candidate: selected, bill },
    ]);
    void reload();
    void invalidateRentalFinance(client, organizationId, selected.contractId).catch(() =>
      setRefreshError(true),
    );
  };
  const nodes = buildPropertyBillingTree(
    context?.items ?? [],
    context?.unpaidBills ?? [],
    completed,
  );
  return (
    <SecondaryPageLayout
      breadcrumbs={breadcrumbs}
      title={`${context?.property.name ?? "房产"} · 账单`}
      description="查看未收账单，填写本期费用后继续出下一期。"
      onBack={onBack}
    >
      <section
        ref={list}
        tabIndex={-1}
        aria-label="房产账单"
        className="space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {query.isError || refreshError ? (
          <div role="alert" className="rounded-lg border p-4 space-y-3">
            <p>
              {completed.length
                ? "账单已生成，账单列表读取失败，请重试后继续。"
                : "账单列表读取失败，请重试。"}
            </p>
            <Button variant="outline" disabled={query.isFetching} onClick={() => void reload()}>
              重试
            </Button>
          </div>
        ) : null}
        {query.isPending && !context && !completed.length ? (
          <div role="status" aria-label="正在读取账单" className="border rounded-lg space-y-3 p-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-10 w-full" />
            ))}
          </div>
        ) : nodes.length ? (
          <PropertyBillingTree
            nodes={nodes}
            today={context?.today ?? ""}
            onNavigateContract={onNavigateContract}
            onNavigateBill={onNavigateBill}
            disabledReason={
              query.isError || refreshError
                ? "账单列表读取失败，请重试后继续。"
                : query.isFetching
                  ? "正在更新账单与下一账期。"
                  : undefined
            }
            onSelect={(candidate, button) => {
              if (
                completed.some(
                  (row) =>
                    propertyBillingIdentity(row.candidate) === propertyBillingIdentity(candidate),
                )
              )
                return;
              trigger.current = button;
              setSelected(candidate);
            }}
          />
        ) : query.isError ? null : (
          <p className="border rounded-lg text-center text-sm text-muted-foreground p-8">
            暂无未收账单或待出账空间
          </p>
        )}
        {selected ? (
          <PeriodBillSheet
            key={propertyBillingIdentity(selected)}
            api={api}
            organizationId={organizationId}
            contractId={selected.contractId}
            open
            spaceLabel={selected.path.map((n) => n.name).join(" / ")}
            tenantNames={selected.tenantNames}
            expectedPeriodStart={selected.period.periodStart}
            onOpenChange={close}
            onGenerated={generated}
            onContextChanged={reload}
          />
        ) : null}
      </section>
    </SecondaryPageLayout>
  );
}
