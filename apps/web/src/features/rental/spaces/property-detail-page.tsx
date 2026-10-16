import { useQuery } from "@tanstack/react-query";
import type { PermissionKey } from "@xpense/shared";
import { Building2, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { ListRentalContractsQuery, RentalApi } from "../../../services/rental-api";
import { rentalQueryOptions } from "../../../services/rental-query";
import { propertyAddress, propertyTypeLabel } from "../properties/property-table";
import { PropertyContractsSection } from "./property-contracts-section";
import type { PropertyDetailSearch } from "./property-detail-search";
import { PropertyOverview } from "./property-overview";
import { SpaceTreeTable } from "./space-tree-table";

export function PropertyDetailPage({
  api,
  organizationId,
  permissions = [],
  propertyId,
  onCreateContract,
  onNavigateContract,
  search,
  onSearchChange,
}: {
  search?: PropertyDetailSearch;
  onSearchChange?: (search: PropertyDetailSearch) => void;
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
  const [localSearch, setLocalSearch] = useState<PropertyDetailSearch>({});
  const activeSearch = search ?? localSearch;
  const { spaceKeyword, spaceEffectiveStatus, spaceLeaseStatus, ...contractSearch } = activeSearch;
  const contractsPage = contractSearch.page ?? 1;
  const contractsPageSize = contractSearch.pageSize ?? 10;
  const changeSearch = (next: PropertyDetailSearch) => {
    if (onSearchChange) onSearchChange(next);
    else setLocalSearch(next);
  };
  const changeContracts = (next: ListRentalContractsQuery) =>
    changeSearch({ spaceKeyword, spaceEffectiveStatus, spaceLeaseStatus, ...next });
  const contractsQuery = useQuery({
    ...rentalQueryOptions.contracts(api, organizationId, {
      ...contractSearch,
      propertyId,
      page: contractsPage,
      pageSize: contractsPageSize,
    }),
    enabled: canReadContracts && Boolean(api.listContracts),
    placeholderData: (previousData, previousQuery) => {
      const previous = previousQuery?.queryKey?.[3] as ListRentalContractsQuery | undefined;
      const keys = [
        "keyword",
        "status",
        "startDateFrom",
        "startDateTo",
        "endDateFrom",
        "endDateTo",
      ] as const;
      return previousQuery?.queryKey?.[1] === organizationId &&
        previous?.propertyId === propertyId &&
        keys.every((key) => previous?.[key] === contractSearch[key])
        ? previousData
        : undefined;
    },
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
      <SpaceTreeTable
        api={api}
        key={`${organizationId}:${propertyId}`}
        organizationId={organizationId}
        permissions={permissions}
        propertyActive={property.isActive}
        onNavigateContract={onNavigateContract}
        propertyId={propertyId}
        filters={{
          keyword: spaceKeyword,
          effectiveStatus: spaceEffectiveStatus,
          leaseStatus: spaceLeaseStatus,
        }}
        onFiltersChange={(next) =>
          changeSearch({
            ...contractSearch,
            spaceKeyword: next.keyword,
            spaceEffectiveStatus: next.effectiveStatus,
            spaceLeaseStatus: next.leaseStatus,
          })
        }
      />
      <PropertyContractsSection
        query={contractsQuery}
        canRead={canReadContracts}
        search={{ ...contractSearch, page: contractsPage, pageSize: contractsPageSize }}
        onFilterChange={changeContracts}
        onPageSizeChange={(pageSize) => changeContracts({ ...contractSearch, page: 1, pageSize })}
        onPageChange={(page) =>
          changeContracts({ ...contractSearch, page, pageSize: contractsPageSize })
        }
        onNavigateContract={onNavigateContract}
      />
    </main>
  );
}
