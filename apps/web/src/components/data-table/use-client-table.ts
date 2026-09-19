import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  functionalUpdate,
  globalFilteringFeature,
  type PaginationState,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import { useState } from "react";

const clientTableFeatures = tableFeatures({
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
});

type ClientTableState = {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnVisibility: ColumnVisibilityState;
  globalFilter: string;
  pagination: PaginationState;
};

/** 由页面持有本地列表状态，先筛选、排序再分页；查询条件变化时回到第一页。 */
export function useClientTable<TData extends object>(
  data: TData[],
  columns: ColumnDef<typeof clientTableFeatures, TData>[],
) {
  const [state, setState] = useState<ClientTableState>({
    sorting: [],
    columnFilters: [],
    columnVisibility: {},
    globalFilter: "",
    pagination: { pageIndex: 0, pageSize: 10 },
  });
  function update<K extends keyof ClientTableState>(
    key: K,
    updater: Updater<ClientTableState[K]>,
    resetPage = false,
  ) {
    setState((current) => ({
      ...current,
      [key]: functionalUpdate(updater, current[key]),
      ...(resetPage ? { pagination: { ...current.pagination, pageIndex: 0 } } : {}),
    }));
  }
  return useTable({
    features: clientTableFeatures,
    data,
    columns,
    state,
    onSortingChange: (updater) => update("sorting", updater, true),
    onColumnFiltersChange: (updater) => update("columnFilters", updater, true),
    onGlobalFilterChange: (updater) => update("globalFilter", updater, true),
    onColumnVisibilityChange: (updater) => update("columnVisibility", updater),
    onPaginationChange: (updater) =>
      setState((current) => {
        const pagination = functionalUpdate(updater, current.pagination);
        return {
          ...current,
          pagination: {
            ...pagination,
            pageIndex:
              pagination.pageSize === current.pagination.pageSize ? pagination.pageIndex : 0,
          },
        };
      }),
  });
}

export type ClientTable<TData extends object> = ReturnType<typeof useClientTable<TData>>;

export type ClientColumnDef<TData extends object> = ColumnDef<typeof clientTableFeatures, TData>;
