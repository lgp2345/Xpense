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

type PaginationProps = {
  /** 页码从 1 开始，状态和请求由页面管理。 */
  page: number;
  pageSize?: number;
  total?: number;
  pageCount?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  className?: string;
  "aria-label"?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export function Pagination({
  page,
  pageSize,
  total,
  pageCount,
  hasNextPage,
  hasPreviousPage,
  pending = false,
  pendingLabel,
  className,
  "aria-label": ariaLabel = "分页",
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages =
    pageCount ??
    (total !== undefined && pageSize !== undefined ? Math.ceil(total / pageSize) : undefined);
  const previousDisabled = pending || !(hasPreviousPage ?? page > 1);
  const nextDisabled = pending || !(hasNextPage ?? (totalPages !== undefined && page < totalPages));
  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center justify-between gap-3 px-2 text-sm", className)}
    >
      {onPageSizeChange && pageSize !== undefined ? (
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            disabled={pending}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger aria-label="每页行数" className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="hidden text-sm font-medium sm:block">每页行数</span>
        </div>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <span className="mr-4 font-medium">
          第 {page} 页{totalPages !== undefined ? `，共 ${totalPages} 页` : ""}
        </span>
        {pending && pendingLabel ? <span aria-live="polite">{pendingLabel}</span> : null}
        <Button
          type="button"
          className="hidden size-8 p-0 lg:flex"
          variant="outline"
          disabled={previousDisabled}
          onClick={() => onPageChange(1)}
        >
          <span className="sr-only">首页</span>
          <ChevronsLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          className="size-8 p-0"
          variant="outline"
          disabled={previousDisabled}
          onClick={() => onPageChange(page - 1)}
        >
          <span className="sr-only">上一页</span>
          <ChevronLeftIcon className="size-4" />
        </Button>
        {totalPages !== undefined
          ? getPageNumbers(page, totalPages).map((number, index) =>
              number === "..." ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: ellipses are a derived display-only sequence
                <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground">
                  ...
                </span>
              ) : (
                <Button
                  key={number}
                  type="button"
                  className="h-8 min-w-8 px-2"
                  aria-current={page === number ? "page" : undefined}
                  variant={page === number ? "default" : "outline"}
                  disabled={pending}
                  onClick={() => onPageChange(number)}
                >
                  {number}
                </Button>
              ),
            )
          : null}
        <Button
          type="button"
          className="size-8 p-0"
          variant="outline"
          disabled={nextDisabled}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="sr-only">下一页</span>
          <ChevronRightIcon className="size-4" />
        </Button>
        {totalPages !== undefined ? (
          <Button
            type="button"
            className="hidden size-8 p-0 lg:flex"
            variant="outline"
            disabled={nextDisabled}
            onClick={() => onPageChange(totalPages)}
          >
            <span className="sr-only">末页</span>
            <ChevronsRightIcon className="size-4" />
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
