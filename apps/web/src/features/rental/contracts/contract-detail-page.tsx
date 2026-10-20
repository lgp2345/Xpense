import { useQuery } from "@tanstack/react-query";
import type { UseNavigateResult } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { Building2, CalendarClock } from "lucide-react";

import type { ReactNode } from "react";
import {
  SecondaryPageLayout,
  type SecondaryPageNavigation,
} from "@/components/layout/secondary-page-layout";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import { ContractBillsSection } from "../bills/contract-bills-section";
import { ContractChargesSection } from "../charges/contract-charges-section";
import { ContractActions } from "./contract-actions";
import {
  DepositSection,
  LifecycleSection,
  Overview,
  SpaceSection,
} from "./contract-detail-sections";
import { ContractPartySection } from "./contract-party-reveal";
import { ContractStatusBadge } from "./contract-status";

export function ContractDetailPage({
  api,
  billsApi,
  financeApi,
  organizationId,
  contractId,
  permissions,
  search,
  navigate,
  onBack,
  breadcrumbs = [
    { key: "contracts", label: "合同管理" },
    { key: "detail", label: "合同详情" },
  ],
}: SecondaryPageNavigation & {
  api: RentalApi;
  billsApi?: RentalBillsApi;
  financeApi?: RentalFinanceApi;
  organizationId: string;
  contractId: string;
  permissions: readonly PermissionKey[];
  search?: Record<string, unknown>;
  navigate?: UseNavigateResult<"/rentals/contracts/$contractId">;
}) {
  const canRead = permissions.includes("rental_contracts:read");
  const query = useQuery({
    ...rentalQueryOptions.contract(api, organizationId, contractId),
    enabled: canRead && Boolean(organizationId && contractId),
  });
  const contract = canRead && query.isSuccess ? query.data : undefined;
  const renderPage = (children: ReactNode, actions?: ReactNode) => (
    <SecondaryPageLayout
      breadcrumbs={breadcrumbs}
      title={contract?.contractNumber ?? "合同详情"}
      onBack={onBack}
      status={contract ? <ContractStatusBadge status={contract.displayStatus} /> : null}
      description={
        contract ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
              <Building2 aria-hidden="true" className="size-4 shrink-0" />
              <span className="break-words">{contract.propertyName}</span>
            </span>
            <span className="min-w-0 break-words">
              外部编号：{contract.externalContractNumber ?? "无外部合同编号"}
            </span>
          </div>
        ) : null
      }
      actions={actions}
    >
      {children}
    </SecondaryPageLayout>
  );
  if (!canRead)
    return renderPage(
      <main className="space-y-3">
        <p className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
          你没有查看合同的权限。
        </p>
      </main>,
    );
  if (query.isPending) return renderPage(<LoadingDetail />);
  if (query.isError)
    return renderPage(<DetailError error={query.error} retry={() => void query.refetch()} />);
  if (!contract) return null;
  return renderPage(
    <main className="space-y-6">
      {contract.hasScheduledTermination ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm"
        >
          <CalendarClock
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <p className="min-w-0 break-words leading-relaxed">
            已安排于 {contract.terminationDate ?? "指定日期"} 终止
            {contract.terminationReason ? `：${contract.terminationReason}` : ""}。
          </p>
        </div>
      ) : null}
      <Overview contract={contract} />
      {financeApi ? (
        <ContractChargesSection
          key={`charges:${organizationId}:${contract.id}`}
          organizationId={organizationId}
          contractId={contract.id}
          api={financeApi}
          permissions={permissions}
          canEdit={contract.lifecycleStatus === "confirmed"}
        />
      ) : null}
      {contract.lifecycleStatus === "confirmed" && contract.displayStatus === "upcoming" ? (
        <p className="text-sm text-muted-foreground">
          修正计费相关信息会作废受影响的有效账单，需要重新预览补齐；无关备注不会影响账单。
        </p>
      ) : null}
      {billsApi ? (
        <ContractBillsSection
          key={`bills:${organizationId}:${contract.id}`}
          organizationId={organizationId}
          contractId={contract.id}
          api={billsApi}
          financeApi={financeApi}
          permissions={permissions}
          canGenerate={
            contract.lifecycleStatus === "confirmed" || contract.lifecycleStatus === "terminated"
          }
          onNavigate={(billId) =>
            void navigate?.({ to: "/rentals/bills/$billId", params: { billId } })
          }
        />
      ) : null}
      <div className="divide-y rounded-xl border bg-card text-card-foreground">
        <SpaceSection contract={contract} />
        <ContractPartySection
          key={`${organizationId}:${contractId}`}
          api={api}
          contract={contract}
          permissions={permissions}
        />
        <DepositSection contract={contract} />
        <LifecycleSection contract={contract} />
      </div>
    </main>,
    <div className="flex flex-wrap gap-2">
      <ContractActions
        key={`${organizationId}:${contract.id}`}
        api={api}
        billsApi={billsApi}
        organizationId={organizationId}
        contract={contract}
        permissions={permissions}
        search={search}
        navigate={navigate}
      />
      {permissions.includes("rental_settlements:read") &&
      (contract.hasScheduledTermination ||
        contract.lifecycleStatus === "terminated" ||
        contract.lifecycleStatus === "cancelled" ||
        contract.displayStatus === "expired") ? (
        <Button
          variant="outline"
          onClick={() =>
            void navigate?.({
              to: "/rentals/settlements/$contractId",
              params: { contractId: contract.id },
            })
          }
        >
          查看退租结算
        </Button>
      ) : null}
    </div>,
  );
}

function LoadingDetail() {
  return (
    <main className="space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-8 w-full max-w-64" />
      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
      <div className="space-y-6 rounded-xl border p-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <span className="sr-only">正在加载合同详情...</span>
    </main>
  );
}
function DetailError({ error, retry }: { error: unknown; retry: () => void }) {
  const message =
    error instanceof ApiError && error.status === 403
      ? "你没有查看合同的权限。"
      : error instanceof ApiError && error.status === 404
        ? "合同不存在或已删除。"
        : "加载合同详情失败，请稍后重试。";
  return (
    <main className="space-y-3">
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      >
        {message}
        <Button variant="link" className="ml-2 px-0" onClick={retry}>
          重试
        </Button>
      </div>
    </main>
  );
}
