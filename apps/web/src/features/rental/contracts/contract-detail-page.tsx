import { useQuery } from "@tanstack/react-query";
import type { UseNavigateResult } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { ArrowLeft, Building2, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
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
  organizationId,
  contractId,
  permissions,
  search,
  navigate,
}: {
  api: RentalApi;
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
  if (!canRead)
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        <p className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
          你没有查看合同的权限。
        </p>
      </main>
    );
  if (query.isPending) return <LoadingDetail />;
  if (query.isError) return <DetailError error={query.error} retry={() => void query.refetch()} />;
  const contract = query.data;
  if (!contract) return null;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
          onClick={() =>
            void navigate?.({ to: "/rentals/contracts" as never, search: search as never })
          }
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回合同列表
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight">
                {contract.contractNumber}
              </h1>
              <ContractStatusBadge status={contract.displayStatus} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5">
                <Building2 aria-hidden="true" className="size-4 shrink-0" />
                <span className="break-words">{contract.propertyName}</span>
              </span>
              <span className="min-w-0 break-words">
                外部编号：{contract.externalContractNumber ?? "无外部合同编号"}
              </span>
            </div>
          </div>
          <ContractActions
            key={`${organizationId}:${contract.id}`}
            api={api}
            organizationId={organizationId}
            contract={contract}
            permissions={permissions}
            search={search}
            navigate={navigate}
          />
        </div>
      </header>
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
    </main>
  );
}

function LoadingDetail() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true">
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
    <main className="space-y-3 p-4 sm:p-6 lg:p-8">
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
