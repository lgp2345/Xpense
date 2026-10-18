import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type PermissionKey,
  type RentalBillDetail,
  type RentalPropertyBillingCandidate,
  rentalPropertyBillingPermissions,
} from "@xpense/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

type Props = {
  propertyId: string;
  organizationId: string;
  permissions: readonly PermissionKey[];
  api: RentalFinanceApi;
  onBack: () => void;
};
export function PropertyBillingPage(props: Props) {
  if (!rentalPropertyBillingPermissions.every((p) => props.permissions.includes(p)))
    return <p role="alert">缺少房产出账权限。</p>;
  return (
    <PropertyBillingWorkbench key={`${props.organizationId}:${props.propertyId}`} {...props} />
  );
}
function PropertyBillingWorkbench({ propertyId, organizationId, api, onBack }: Props) {
  const client = useQueryClient();
  const [completed, setCompleted] = useState<CompletedPropertyBill[]>([]);
  const [selected, setSelected] = useState<RentalPropertyBillingCandidate | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const query = useQuery({
    queryKey: propertyBillingKey(organizationId, propertyId),
    queryFn: ({ signal }) => loadPropertyBillingCandidates(api, propertyId, { signal }),
    retry: false,
    refetchOnMount: "always",
  });
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
    <section className="space-y-4 p-4 sm:p-6 lg:p-8">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" aria-label="返回房产列表" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{query.data?.property.name ?? "房产"} · 生成账单</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            选择待出账空间，核对本期费用后生成账单。
          </p>
        </div>
        <Button variant="outline" className="ml-auto shrink-0" onClick={() => void query.refetch()}>
          刷新列表
        </Button>
      </div>
      {refreshError ? (
        <p role="status" className="text-sm text-muted-foreground">
          账单已生成，财务数据刷新失败，请稍后刷新。
        </p>
      ) : null}
      {query.isError ? (
        <div role="alert" className="rounded-lg border p-4 space-y-3">
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
          className="rounded-lg border p-4 space-y-3"
        >
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : nodes.length ? (
        <PropertyBillingTree
          nodes={nodes}
          today={query.data?.today ?? ""}
          onSelect={(candidate, button) => {
            if (completed.some((row) => row.candidate.contractId === candidate.contractId)) return;
            trigger.current = button;
            setSelected(candidate);
          }}
        />
      ) : query.isError ? null : (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
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
  );
}
