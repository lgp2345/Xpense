import { Pagination } from "@/components/pagination";

type DataTablePaginationProps = {
  table: {
    state: { pagination: { pageIndex: number; pageSize: number } };
    getPageCount: () => number;
    getCanPreviousPage: () => boolean;
    getCanNextPage: () => boolean;
    setPageIndex: (pageIndex: number) => void;
    setPageSize: (pageSize: number) => void;
  };
  className?: string;
};

/** 将表格的零基页码转换为通用分页的一基页码。 */
export function DataTablePagination({ table, className }: DataTablePaginationProps) {
  return (
    <Pagination
      page={table.state.pagination.pageIndex + 1}
      pageSize={table.state.pagination.pageSize}
      pageCount={table.getPageCount()}
      hasPreviousPage={table.getCanPreviousPage()}
      hasNextPage={table.getCanNextPage()}
      className={className}
      onPageChange={(page) => table.setPageIndex(page - 1)}
      onPageSizeChange={(pageSize) => table.setPageSize(pageSize)}
    />
  );
}
