import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getPageNumbers } from "@/lib/utils";

type DataTablePaginationProps = {
  // biome-ignore lint/suspicious/noExplicitAny: tanstack v9 type system requires any for generic components
  table: any;
  className?: string;
};

export function DataTablePagination({ table, className }: DataTablePaginationProps) {
  const currentPage = table.state.pagination.pageIndex + 1;
  const totalPages = table.getPageCount();
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div
      className={cn("flex items-center justify-between overflow-clip px-2", className)}
      style={{ overflowClipMargin: 1 }}
    >
      <div className="flex items-center gap-2">
        <Select
          value={`${table.state.pagination.pageSize}`}
          onValueChange={(value: string) => {
            table.setPageSize(Number(value));
          }}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue placeholder={table.state.pagination.pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {[10, 20, 30, 40, 50].map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="hidden text-sm font-medium sm:block">每页行数</p>
      </div>

      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center justify-center text-sm font-medium">
          第 {currentPage} 页，共 {totalPages} 页
        </div>
        <div className="flex items-center space-x-2">
          <Button
            className="hidden size-8 p-0 lg:flex"
            disabled={!table.getCanPreviousPage()}
            variant="outline"
            onClick={() => table.setPageIndex(0)}
          >
            <span className="sr-only">首页</span>
            <ChevronsLeftIcon className="size-4" />
          </Button>
          <Button
            className="size-8 p-0"
            disabled={!table.getCanPreviousPage()}
            variant="outline"
            onClick={() => table.previousPage()}
          >
            <span className="sr-only">上一页</span>
            <ChevronLeftIcon className="size-4" />
          </Button>

          {pageNumbers.map((pageNumber, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: pageNumbers is a stable derived array
            <div key={`${pageNumber}-${index}`} className="flex items-center">
              {pageNumber === "..." ? (
                <span className="px-1 text-sm text-muted-foreground">...</span>
              ) : (
                <Button
                  className="h-8 min-w-8 px-2"
                  variant={currentPage === pageNumber ? "default" : "outline"}
                  onClick={() => table.setPageIndex((pageNumber as number) - 1)}
                >
                  {pageNumber}
                </Button>
              )}
            </div>
          ))}

          <Button
            className="size-8 p-0"
            disabled={!table.getCanNextPage()}
            variant="outline"
            onClick={() => table.nextPage()}
          >
            <span className="sr-only">下一页</span>
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            className="hidden size-8 p-0 lg:flex"
            disabled={!table.getCanNextPage()}
            variant="outline"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          >
            <span className="sr-only">末页</span>
            <ChevronsRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
