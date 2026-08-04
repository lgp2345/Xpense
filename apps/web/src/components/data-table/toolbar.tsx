import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableFacetedFilter } from "./faceted-filter";
import { DataTableViewOptions } from "./view-options";

type DataTableToolbarProps = {
  // biome-ignore lint/suspicious/noExplicitAny: tanstack v9 type system requires any for generic components
  table: any;
  searchPlaceholder?: string;
  searchKey?: string;
  filters?: {
    columnId: string;
    title: string;
    options: {
      label: string;
      value: string;
      icon?: React.ComponentType<{ className?: string }>;
    }[];
  }[];
};

export function DataTableToolbar({
  table,
  searchPlaceholder = "搜索...",
  searchKey,
  filters = [],
}: DataTableToolbarProps) {
  const isFiltered = table.state.columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">
        {searchKey ? (
          <Input
            className="h-8 w-[150px] lg:w-[250px]"
            placeholder={searchPlaceholder}
            value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
          />
        ) : (
          <Input
            className="h-8 w-[150px] lg:w-[250px]"
            placeholder={searchPlaceholder}
            value={(table.state.globalFilter as string) ?? ""}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              table.setGlobalFilter(event.target.value)
            }
          />
        )}
        <div className="flex gap-x-2">
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;
            return (
              <DataTableFacetedFilter
                column={column}
                key={filter.columnId}
                options={filter.options}
                title={filter.title}
              />
            );
          })}
        </div>
        {isFiltered ? (
          <Button
            className="h-8 px-2 lg:px-3"
            variant="ghost"
            onClick={() => {
              table.resetColumnFilters();
              table.setGlobalFilter("");
            }}
          >
            重置
            <XIcon className="ml-1 size-4" />
          </Button>
        ) : null}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  );
}
