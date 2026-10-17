import type { UseQueryResult } from '@tanstack/react-query'
import type { RentalContractPage } from '@xpense/shared'
import { FileText } from 'lucide-react'
import { Pagination } from '@/components/pagination'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '../../../services/api-client'
import type { ListRentalContractsQuery } from '../../../services/rental-api'
import { ContractFilters } from '../contracts/contract-filters'
import { PropertyContractList } from './property-contract-list'

export function PropertyContractsSection({
  query,
  canRead,
  onPageChange,
  onPageSizeChange,
  onNavigateContract,
  search,
  onFilterChange,
}: {
  search: ListRentalContractsQuery
  onFilterChange: (search: ListRentalContractsQuery) => void
  query: UseQueryResult<RentalContractPage, Error>
  canRead: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onNavigateContract?: (contractId: string) => void
}) {
  if (!canRead)
    return (
      <p className="bg-muted border rounded-lg text-sm text-muted-foreground p-3">
        你没有查看合同的权限。
      </p>
    )
  const page = query.data
  return (
    <section
      aria-labelledby="property-contracts-title"
      className="bg-card border rounded-xl space-y-4 text-card-foreground p-5 lg:p-6"
    >
      <div className="flex gap-3 items-center justify-between">
        <h2
          id="property-contracts-title"
          className="flex font-semibold text-sm gap-2 items-center"
        >
          <FileText
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
          当前房产合同
          {page ? (
            <span
              aria-hidden="true"
              className="font-normal text-muted-foreground tabular-nums"
            >
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
      <ContractFilters
        propertyScoped
        search={search}
        onApply={onFilterChange}
      />
      {query.isError ? (
        <div
          role="alert"
          className="border rounded-md bg-destructive/10 border-destructive/30 text-sm text-destructive p-3"
        >
          {query.error instanceof ApiError && query.error.status === 403
            ? '你没有查看当前房产合同的权限。'
            : '加载房产合同失败，请稍后重试。'}
          <Button
            variant="link"
            className="ml-2 px-0"
            onClick={() => void query.refetch()}
          >
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
        <PropertyContractList
          items={page.items}
          onNavigateContract={onNavigateContract}
        />
      ) : (
        <p className="rounded-lg bg-muted/30 text-center text-sm text-muted-foreground py-8 px-4">
          {search.keyword ||
          search.status ||
          search.startDateFrom ||
          search.startDateTo ||
          search.endDateFrom ||
          search.endDateTo
            ? '没有匹配筛选条件的合同。'
            : '当前房产没有合同。'}
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
  )
}
