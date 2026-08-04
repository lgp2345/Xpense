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
import type { PermissionKey } from "@xpense/shared";
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
import type {
  IamPermission,
  IamRoleWithPermissions,
  UpdateRoleRequest,
} from "../../services/iam-api";
import { createRoleColumns } from "./role-columns";

const roleTableFeatures = tableFeatures({
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

type RoleTableProps = {
  isMutating: boolean;
  permissions: readonly PermissionKey[];
  permissionItems: IamPermission[];
  roles: IamRoleWithPermissions[];
  onDelete: (roleId: string) => Promise<boolean>;
  onUpdate: (roleId: string, input: UpdateRoleRequest) => Promise<boolean>;
};

export function RoleTable({
  isMutating,
  permissions,
  permissionItems,
  roles,
  onDelete,
  onUpdate,
}: RoleTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const columns = createRoleColumns({
    isMutating,
    permissions,
    permissionItems,
    onDelete,
    onUpdate,
  });

  const table = useTable({
    features: roleTableFeatures,
    data: roles,
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

  if (roles.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">当前没有角色。</p>;
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchPlaceholder="搜索角色..."
        filters={[
          {
            columnId: "isSystem",
            title: "类型",
            options: [
              { label: "系统角色", value: "true" },
              { label: "自定义角色", value: "false" },
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
                    没有匹配的角色。
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
