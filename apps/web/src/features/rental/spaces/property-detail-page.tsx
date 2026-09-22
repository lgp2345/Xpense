import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { PermissionKey, RentalContractPage } from "@xpense/shared";
import { Building2, ChevronRight, FileText, MapPin, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import { ContractStatusBadge } from "../contracts/contract-status";
import { propertyAddress, propertyTypeLabel } from "../properties/property-table";
import { PropertyOverview } from "./property-overview";
import { SpaceTreeTable } from "./space-tree-table";

export function PropertyDetailPage({
  api,
  organizationId,
  permissions = [],
  propertyId,
  onCreateContract,
  onNavigateContract,
}: {
  api: RentalApi;
  organizationId: string;
  permissions?: readonly PermissionKey[];
  propertyId: string;
  onCreateContract?: (propertyId: string) => void;
  onNavigateContract?: (contractId: string) => void;
}) {
  const query = useQuery(rentalQueryOptions.property(api as RentalApi, organizationId, propertyId));
  const canReadContracts = permissions.includes("rental_contracts:read");
  const canCreateContract =
    permissions.includes("rental_contracts:create") &&
    permissions.includes("rental_contracts:read") &&
    permissions.includes("rental_contracts:update");
  const [contractsPage, setContractsPage] = useState(1);
  const [contractsPageSize, setContractsPageSize] = useState(10);
  // biome-ignore lint/correctness/useExhaustiveDependencies: route scope is the local pagination session
  useEffect(() => {
    setContractsPage(1);
  }, [organizationId, propertyId]);
  const contractsQuery = useQuery({
    ...rentalQueryOptions.contracts(api, organizationId, {
      propertyId,
      page: contractsPage,
      pageSize: contractsPageSize,
    }),
    enabled: canReadContracts && Boolean(api.listContracts),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey?.[1] === organizationId &&
      (previousQuery?.queryKey?.[3] as { propertyId?: string } | undefined)?.propertyId ===
        propertyId
        ? previousData
        : undefined,
    retry: false,
  });
  if (query.isPending)
    return (
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-3" aria-live="polite" aria-busy="true">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-full max-w-96" />
          <span className="sr-only">正在加载房产详情...</span>
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </main>
    );
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        {missing ? (
          <p className="py-10 text-center text-sm text-muted-foreground">房产不存在或已被删除。</p>
        ) : (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            加载房产详情失败，请稍后重试。
          </p>
        )}
      </main>
    );
  }
  const property = query.data;
  if (!property) return null;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight">
              {property.name}
            </h1>
            <Badge variant={property.isActive ? "default" : "secondary"}>
              {property.isActive ? "启用" : "停用"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Building2 aria-hidden="true" className="size-4 shrink-0" />
              {propertyTypeLabel(property)}
            </span>
            <span className="flex min-w-0 items-start gap-1.5">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="break-words">{propertyAddress(property)}</span>
            </span>
          </div>
        </div>
        {canCreateContract && property.isActive ? (
          <Button
            type="button"
            className="shrink-0"
            onClick={() => onCreateContract?.(property.id)}
          >
            <Plus aria-hidden="true" className="size-4" />
            为此房产新建合同
          </Button>
        ) : null}
      </header>
      <PropertyOverview property={property} />
      {!property.isActive ? (
        <p className="rounded-lg border border-muted-foreground/20 bg-muted p-3 text-sm text-muted-foreground">
          此房产已停用，所属空间因上级停用而不可用。
        </p>
      ) : null}
      <PropertyContractsSection
        query={contractsQuery}
        canRead={canReadContracts}
        onPageSizeChange={(pageSize) => {
          setContractsPageSize(pageSize);
          setContractsPage(1);
        }}
        onPageChange={setContractsPage}
        onNavigateContract={onNavigateContract}
      />
      <SpaceTreeTable
        api={api}
        key={`${organizationId}:${propertyId}`}
        organizationId={organizationId}
        permissions={permissions}
        propertyActive={property.isActive}
        propertyId={propertyId}
      />
    </main>
  );
}

function PropertyContractsSection({
  query,
  canRead,
  onPageChange,
  onPageSizeChange,
  onNavigateContract,
}: {
  query: UseQueryResult<RentalContractPage, Error>;
  canRead: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onNavigateContract?: (contractId: string) => void;
}) {
  if (!canRead)
    return (
      <p className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
        你没有查看合同的权限。
      </p>
    );
  if (query.isPending && !query.data)
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-6 w-48" />
          <span className="sr-only">正在加载房产合同...</span>
        </CardContent>
      </Card>
    );
  if (query.isError && !query.data) {
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      >
        {forbidden ? "你没有查看当前房产合同的权限。" : "加载房产合同失败，请稍后重试。"}
        <Button variant="link" className="ml-2 px-0" onClick={() => void query.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  const page = query.data;
  return (
    <section
      aria-labelledby="property-contracts-title"
      className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground lg:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="property-contracts-title" className="flex items-center gap-2 text-sm font-semibold">
          <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
          当前房产合同
        </h2>
        {query.isFetching ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            正在更新...
          </span>
        ) : null}
      </div>
      {query.isError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {query.error instanceof ApiError && query.error.status === 403
            ? "你没有查看当前房产合同的权限。"
            : "加载房产合同失败，请稍后重试。"}
          <Button variant="link" className="ml-2 px-0" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
      {page?.items.length ? (
        <div className="divide-y">
          {page.items.map((contract) => (
            <a
              key={contract.id}
              href={`/rentals/contracts/${contract.id}`}
              className="group flex min-w-0 items-center gap-3 rounded-md px-3 py-4 text-sm outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={(event) => {
                if (!onNavigateContract) return;
                event.preventDefault();
                onNavigateContract(contract.id);
              }}
            >
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
                <p className="break-words font-medium">{contract.contractNumber}</p>
                <p className="break-words text-muted-foreground">
                  {contract.tenantNames.join("、") || "未指定承租方"}
                </p>
              </div>
              <ContractStatusBadge status={contract.displayStatus} />
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          当前房产没有合同。
        </p>
      )}
      {page ? (
        <Pagination
          page={page.page}
          pageSize={page.pageSize}
          total={page.total}
          pending={query.isFetching}
          onPageSizeChange={onPageSizeChange}
          onPageChange={onPageChange}
        />
      ) : null}
    </section>
  );
}
