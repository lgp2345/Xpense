import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type PermissionKey,
  type RentalBillDetail,
  type RentalPropertyBillingCandidate,
  type RentalPropertyBillingPage,
  rentalPropertyBillingPermissions,
} from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
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
  onBack: () => void;
};
export function PropertyBillingPage(props: Props) {
  if (!rentalPropertyBillingPermissions.every((p) => props.permissions.includes(p)))
    return (
      <SecondaryPageLayout
        breadcrumbs={
          props.breadcrumbs ?? [
            { key: "properties", label: "房产管理" },
            { key: "billing", label: "生成账单" },
          ]
        }
        title="生成账单"
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
    { key: "billing", label: "生成账单" },
  ],
  onNavigateContract,
}: Props) {
  const client = useQueryClient();
  const [completed, setCompleted] = useState<CompletedPropertyBill[]>([]);
  const [selected, setSelected] = useState<RentalPropertyBillingCandidate | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [lastContext, setLastContext] = useState<Pick<
    RentalPropertyBillingPage,
    "property" | "today" | "timezone"
  > | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const query = useQuery({
    queryKey: propertyBillingKey(organizationId, propertyId),
    queryFn: ({ signal }) => loadPropertyBillingCandidates(api, propertyId, { signal }),
    retry: false,
    refetchOnMount: "always",
  });
  useEffect(() => {
    if (query.data) {
      const { property, today, timezone } = query.data;
      setLastContext({ property, today, timezone });
    }
  }, [query.data]);
  const context = query.data ?? lastContext;
  const refetch = query.refetch;
  // Activity 恢复时重新读取服务端组织日期；本轮结果和编辑会话保留。
  useEffect(() => {
    void refetch({ cancelRefetch: false });
  }, [refetch]);
  const close = (open: boolean) => {
    if (!open) {
      setSelected(null);
      const target = trigger.current;
      requestAnimationFrame(() => target?.focus());
    }
  };
  const generated = (bill: RentalBillDetail) => {
    if (!selected) return;
    setCompleted((old) => [
      ...old.filter((row) => row.candidate.contractId !== selected.contractId),
      { candidate: selected, bill },
    ]);
    setRefreshError(false);
    void invalidateRentalFinance(client, organizationId, selected.contractId).catch(() =>
      setRefreshError(true),
    );
  };
  const nodes = buildPropertyBillingTree(query.data?.items ?? [], completed);
  return (
    <SecondaryPageLayout
      breadcrumbs={breadcrumbs}
      title={`${context?.property.name ?? "房产"} · 生成账单`}
      description="选择待出账空间，核对本期费用后生成账单。"
      onBack={onBack}
      actions={
        <Button variant="outline" onClick={() => void query.refetch()}>
          刷新列表
        </Button>
      }
    >
      <section className="space-y-4">
        {refreshError ? (
          <p role="status" className="text-sm text-muted-foreground">
            账单已生成，财务数据刷新失败，请稍后刷新。
          </p>
        ) : null}
        {query.isError ? (
          <div role="alert" className="border rounded-lg space-y-3 p-4">
            <p>待出账空间读取失败，请重试。</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {query.isPending ? (
          <div
            role="status"
            aria-label="正在读取待出账空间"
            className="border rounded-lg space-y-3 p-4"
          >
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-10 w-full" />
            ))}
          </div>
        ) : nodes.length ? (
          <PropertyBillingTree
            nodes={nodes}
            today={context?.today ?? ""}
            onNavigateContract={onNavigateContract}
            onSelect={(candidate, button) => {
              if (completed.some((row) => row.candidate.contractId === candidate.contractId))
                return;
              trigger.current = button;
              setSelected(candidate);
            }}
          />
        ) : query.isError ? null : (
          <p className="border rounded-lg text-center text-sm text-muted-foreground p-8">
            暂无可生成账单的空间
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
          />
        ) : null}
      </section>
    </SecondaryPageLayout>
  );
}
