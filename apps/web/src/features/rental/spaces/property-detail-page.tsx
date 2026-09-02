import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { PermissionKey, RentalContractPage } from "@xpense/shared";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import { propertyAddress, propertyTypeLabel } from "../properties/property-table";
import { SpaceTreeTable } from "./space-tree-table";

/** 可独立使用的房产详情页头部；空间树会在后续任务附加到此页面。 */
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: route scope is the local pagination session
  useEffect(() => {
    setContractsPage(1);
  }, [organizationId, propertyId]);
  const contractsQuery = useQuery({
    ...rentalQueryOptions.contracts(api, organizationId, {
      propertyId,
      page: contractsPage,
      pageSize: 10,
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
      <main className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-full" />
            <span className="sr-only">正在加载房产详情...</span>
          </CardContent>
        </Card>
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
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-medium tracking-tight">{property.name}</h1>
            <Badge variant={property.isActive ? "default" : "secondary"}>
              {property.isActive ? "启用" : "停用"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {propertyTypeLabel(property)} · {propertyAddress(property)}
          </p>
        </div>
      </header>
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">空间总数</span>
            <p className="mt-1 font-medium">{property.spaceCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">可出租空间</span>
            <p className="mt-1 font-medium">{property.rentableSpaceCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">生效中合同</span>
            <p className="mt-1 font-medium">{property.activeContractCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">即将生效合同</span>
            <p className="mt-1 font-medium">{property.upcomingContractCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">即将到期合同</span>
            <p className="mt-1 font-medium">{property.expiringSoonContractCount}</p>
          </div>
          {property.note ? (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">备注</span>
              <p className="mt-1 whitespace-pre-wrap">{property.note}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {canCreateContract && property.isActive ? (
        <Button type="button" onClick={() => onCreateContract?.(property.id)}>
          为此房产新建合同
        </Button>
      ) : null}
      {!property.isActive ? (
        <p className="rounded-lg border border-muted-foreground/20 bg-muted p-3 text-sm text-muted-foreground">
          此房产已停用，所属空间因上级停用而不可用。
        </p>
      ) : null}
      <PropertyContractsSection
        query={contractsQuery}
        canRead={canReadContracts}
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
  onNavigateContract,
}: {
  query: UseQueryResult<RentalContractPage, Error>;
  canRead: boolean;
  onPageChange: (page: number) => void;
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
    <section aria-labelledby="property-contracts-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="property-contracts-title" className="text-lg font-medium">
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
        <div className="grid gap-2 sm:grid-cols-2">
          {page.items.map((contract) => (
            <a
              key={contract.id}
              href={`/rentals/contracts/${contract.id}`}
              className="rounded-md border p-3 text-sm hover:bg-muted"
              onClick={(event) => {
                if (!onNavigateContract) return;
                event.preventDefault();
                onNavigateContract(contract.id);
              }}
            >
              <p className="font-medium">{contract.contractNumber}</p>
              <p className="text-muted-foreground">
                {contract.tenantNames.join("、") || "未指定承租方"} · {contract.displayStatus}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">当前房产没有合同。</p>
      )}
      {page ? (
        <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
          <span>
            显示第 {page.page} 页，共 {page.total} 个合同
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={query.isFetching || page.page <= 1}
            onClick={() => onPageChange(page.page - 1)}
          >
            上一页
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={query.isFetching || page.page * page.pageSize >= page.total}
            onClick={() => onPageChange(page.page + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </section>
  );
}
