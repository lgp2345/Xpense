import {
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
  flexRender,
  globalFilteringFeature,
  type PaginationState,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useState } from "react";

import { DataTablePagination, DataTableToolbar } from "@/components/data-table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SessionResponse } from "../../services/auth-api";
import { createSessionColumns } from "./session-columns";

const sessionTableFeatures = tableFeatures({
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
});

export type SessionListItem = Pick<
  SessionResponse,
  "clientType" | "id" | "lastUsedAt" | "status"
> & {
  deviceName?: string;
};

type SessionTableProps = {
  canRevoke: boolean;
  currentSessionId?: string;
  isMutating: boolean;
  sessions: SessionListItem[];
  onRevoke: (sessionId: string) => Promise<void>;
};

export function SessionTable({
  canRevoke,
  currentSessionId,
  isMutating,
  sessions,
  onRevoke,
}: SessionTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const columns = createSessionColumns({
    canRevoke,
    currentSessionId,
    isMutating,
    onRevoke,
  });

  const table = useTable({
    features: sessionTableFeatures,
    data: sessions,
    columns,
    state: {
      sorting,
      pagination,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
  });

  if (sessions.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">当前没有可管理的会话。</p>
    );
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchPlaceholder="搜索..."
        filters={[
          {
            columnId: "status",
            title: "状态",
            options: [
              { label: "有效", value: "active" },
              { label: "已撤销", value: "revoked" },
            ],
          },
        ]}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    没有匹配的会话。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DataTablePagination table={table} />
    </div>
  );
}
