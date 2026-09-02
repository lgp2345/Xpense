import { useQuery } from "@tanstack/react-query";
import type { UseNavigateResult } from "@tanstack/react-router";
import type { PermissionKey, RentalContractDetail } from "@xpense/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import { ContractActions } from "./contract-actions";
import { ContractPartySection } from "./contract-party-reveal";
import { ContractStatusBadge } from "./contract-status";
import { formatMoney } from "./contract-table";

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
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            variant="link"
            className="mb-2 px-0"
            onClick={() =>
              void navigate?.({ to: "/rentals/contracts" as never, search: search as never })
            }
          >
            返回合同列表
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-medium tracking-tight">{contract.contractNumber}</h1>
            <ContractStatusBadge status={contract.displayStatus} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {contract.propertyName} · {contract.externalContractNumber ?? "无外部合同编号"}
          </p>
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
      </header>
      {contract.hasScheduledTermination ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
        >
          已安排于 {contract.terminationDate ?? "指定日期"} 终止
          {contract.terminationReason ? `：${contract.terminationReason}` : ""}。
        </div>
      ) : null}
      <Overview contract={contract} />
      <SpaceSection contract={contract} />
      <ContractPartySection
        key={`${organizationId}:${contractId}`}
        api={api}
        contract={contract}
        permissions={permissions}
      />
      <DepositSection contract={contract} />
      <LifecycleSection contract={contract} />
    </main>
  );
}

function Overview({ contract }: { contract: RentalContractDetail }) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Info
          label="合同期"
          value={`${contract.startDate ?? "未开始"} 至 ${contract.endDate ?? "未结束"}`}
        />
        <Info label="实际结束日" value={contract.actualEndDate ?? "未结束"} />
        <Info label="租金" value={formatMoney(contract.rentAmountMinor)} />
        <Info
          label="计费锚点"
          value={
            contract.billingAnchor === "contract_start"
              ? "合同起始日"
              : contract.billingAnchor === "calendar_month"
                ? "自然月"
                : "未设置"
          }
        />
        <Info
          label="付款周期"
          value={
            contract.paymentIntervalMonths ? `每 ${contract.paymentIntervalMonths} 个月` : "未设置"
          }
        />
        <Info
          label="提前几天到期"
          value={contract.dueDaysBefore === null ? "未设置" : `${contract.dueDaysBefore} 天`}
        />
        <Info label="续租来源" value={contract.renewedFromContractId ?? "无"} />
        {contract.note ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="text-muted-foreground">备注</span>
            <p className="mt-1 whitespace-pre-wrap">{contract.note}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
function SpaceSection({ contract }: { contract: RentalContractDetail }) {
  return (
    <Section title="空间快照">
      {contract.spaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">未指定空间。</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {contract.spaces.map((space) => (
            <Card key={space.spaceId}>
              <CardContent className="p-4 text-sm">
                <p className="font-medium">
                  {space.spacePath.map((node) => node.name).join(" / ")}
                </p>
                <p className="mt-1 text-muted-foreground">
                  空间：{space.spaceName}
                  {space.spaceCode ? `（${space.spaceCode}）` : ""}
                </p>
                <p className="mt-1">租金分摊：{formatMoney(space.rentAllocationMinor)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
function DepositSection({ contract }: { contract: RentalContractDetail }) {
  return (
    <Section title="押金">
      <div className="grid gap-2 sm:grid-cols-2">
        {contract.depositTerms.length === 0 ? (
          <p className="text-sm text-muted-foreground">未设置押金。</p>
        ) : (
          contract.depositTerms.map((term) => (
            <Card key={term.id}>
              <CardContent className="p-4 text-sm">
                <p className="font-medium">{term.customName ?? depositLabel(term.type)}</p>
                <p>计算方式：{term.calculationMode === "fixed_amount" ? "固定金额" : "租金倍数"}</p>
                <p>
                  约定值：
                  {term.calculationMode === "fixed_amount"
                    ? formatMoney(term.fixedAmountMinor)
                    : `${term.rentMultiple ?? "未设置"} 倍租金`}
                </p>
                <p>最终金额：{formatMoney(term.finalAmountMinor)}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </Section>
  );
}
function LifecycleSection({ contract }: { contract: RentalContractDetail }) {
  return (
    <Section title="生命周期">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="取消原因" value={contract.cancellationReason ?? "无"} />
        <Info label="终止日期" value={contract.terminationDate ?? "无"} />
        <Info label="终止原因" value={contract.terminationReason ?? "无"} />
      </div>
    </Section>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="mt-1 break-words">{value}</p>
    </div>
  );
}
function LoadingDetail() {
  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <Skeleton className="h-8 w-64" />
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
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
function depositLabel(type: string): string {
  return (
    (
      {
        rental: "租金押金",
        utility: "水电押金",
        access_card: "门禁卡押金",
        other: "其他押金",
      } as Record<string, string>
    )[type] ?? "押金"
  );
}
