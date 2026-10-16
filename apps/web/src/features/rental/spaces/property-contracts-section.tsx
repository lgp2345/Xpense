import type { UseQueryResult } from "@tanstack/react-query";
import type { RentalContractPage } from "@xpense/shared";
import { FileText } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "../../../services/api-client";
import type { ListRentalContractsQuery } from "../../../services/rental-api";
import { ContractFilters } from "../contracts/contract-filters";
import { PropertyContractList } from "./property-contract-list";

export function PropertyContractsSection({
  query,
  canRead,
  onPageChange,
  onPageSizeChange,
  onNavigateContract,
  search,
  onFilterChange,
}: {
  search: ListRentalContractsQuery;
  onFilterChange: (search: ListRentalContractsQuery) => void;
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
          {page ? (
            <span aria-hidden="true" className="font-normal tabular-nums text-muted-foreground">
              {page.total}
            </span>
          ) : null}
        </h2>
        {query.isFetching ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            正在更新...
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">查看此房产的全部合同及其归属空间。</p>
      <ContractFilters propertyScoped search={search} onApply={onFilterChange} />
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
      {query.isPending && !page ? (
        <div aria-busy="true" aria-live="polite">
          <Skeleton className="h-24 w-full" />
          <span className="sr-only">正在加载房产合同...</span>
        </div>
      ) : query.isError && !page ? null : page?.items.length ? (
        <PropertyContractList items={page.items} onNavigateContract={onNavigateContract} />
      ) : (
        <p className="rounded-lg bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {search.keyword ||
          search.status ||
          search.startDateFrom ||
          search.startDateTo ||
          search.endDateFrom ||
          search.endDateTo
            ? "没有匹配筛选条件的合同。"
            : "当前房产没有合同。"}
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
