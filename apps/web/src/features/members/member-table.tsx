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
import type { IamMember, IamRole } from "../../services/iam-api";
import { createMemberColumns } from "./member-columns";

// Static features definition — outside component per v9 best practice
const memberTableFeatures = tableFeatures({
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

type MemberTableProps = {
  isMutating: boolean;
  members: IamMember[];
  permissions: readonly PermissionKey[];
  roles: IamRole[];
  onRoleChange: (memberId: string, roleId: string) => Promise<void>;
  onStatusChange: (memberId: string, status: "active" | "disabled") => Promise<void>;
};

export function MemberTable({
  isMutating,
  members,
  permissions,
  roles,
  onRoleChange,
  onStatusChange,
}: MemberTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const columns = createMemberColumns({
    isMutating,
    permissions,
    roles,
    onRoleChange,
    onStatusChange,
  });

  const table = useTable({
    features: memberTableFeatures,
    data: members,
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

  if (members.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">当前没有成员。</p>;
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchKey="email"
        searchPlaceholder="搜索邮箱..."
        filters={[
          {
            columnId: "roleName",
            title: "角色",
            options: roles.map((role) => ({
              label: role.name,
              value: role.name,
            })),
          },
          {
            columnId: "status",
            title: "状态",
            options: [
              { label: "已启用", value: "active" },
              { label: "已禁用", value: "disabled" },
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
                    没有匹配的成员。
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
