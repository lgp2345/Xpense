import { Settings2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DataTableViewOptionsProps = {
  // biome-ignore lint/suspicious/noExplicitAny: tanstack v9 type system requires any for generic components
  table: any;
};

export function DataTableViewOptions({ table }: DataTableViewOptionsProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button className="ml-auto hidden h-8 lg:flex" size="sm" variant="outline">
          <Settings2Icon className="size-4" />
          列显隐
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuLabel>切换列</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            // biome-ignore lint/suspicious/noExplicitAny: tanstack v9 type system constraint
            (column: any) =>
              typeof column.columnDef.accessorKey !== "undefined" && column.getCanHide(),
          )
          // biome-ignore lint/suspicious/noExplicitAny: tanstack v9 type system constraint
          .map((column: any) => {
            return (
              <DropdownMenuCheckboxItem
                checked={column.getIsVisible()}
                className="capitalize"
                key={column.id}
                onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
