import { CheckIcon, PlusCircleIcon } from "lucide-react";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type DataTableFacetedFilterProps = {
  id?: string;
  value: string[];
  onChange: (value: string[] | undefined) => void;
  // biome-ignore lint/suspicious/noExplicitAny: tanstack v9 type system requires any for generic components
  column?: any;
  title?: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
};

export function DataTableFacetedFilter({
  id,
  value,
  onChange,
  column,
  title,
  options,
}: DataTableFacetedFilterProps) {
  const summaryId = useId();
  const facets = column?.getFacetedUniqueValues();
  const selectedValues = new Set(value);

  return (
    <Popover>
      <span id={summaryId} className="sr-only">
        {selectedValues.size
          ? `已选择：${options
              .filter((option) => selectedValues.has(option.value))
              .map((option) => option.label)
              .join("、")}`
          : "未选择筛选条件"}
      </span>
      <PopoverTrigger
        render={
          <Button
            id={id}
            aria-describedby={summaryId}
            className="h-9 w-full justify-start text-base md:text-sm"
            variant="outline"
          >
            <PlusCircleIcon className="size-4" />
            {title}
            {selectedValues.size > 0 ? (
              <>
                <Separator className="mx-2 h-4" orientation="vertical" />
                <Badge className="rounded-sm px-1 font-normal lg:hidden" variant="secondary">
                  {selectedValues.size}
                </Badge>
                <div className="hidden min-w-0 flex-1 gap-1 lg:flex">
                  {selectedValues.size > 2 ? (
                    <Badge
                      className="min-w-0 shrink rounded-sm px-1 font-normal"
                      variant="secondary"
                    >
                      <span className="truncate">{selectedValues.size} 项已选</span>
                    </Badge>
                  ) : (
                    options
                      .filter((option) => selectedValues.has(option.value))
                      .map((option) => (
                        <Badge
                          className="min-w-0 shrink rounded-sm px-1 font-normal"
                          key={option.value}
                          title={option.label}
                          variant="secondary"
                        >
                          <span className="truncate">{option.label}</span>
                        </Badge>
                      ))
                  )}
                </div>
              </>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>无匹配结果。</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value);
                      } else {
                        selectedValues.add(option.value);
                      }
                      const filterValues = Array.from(selectedValues);
                      onChange(filterValues.length ? filterValues : undefined);
                    }}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <CheckIcon className="size-4" />
                    </div>
                    {option.icon ? <option.icon className="size-4 text-muted-foreground" /> : null}
                    <span>{option.label}</span>
                    {facets?.get(option.value) ? (
                      <span className="ml-auto flex size-4 items-center justify-center font-mono text-xs">
                        {facets.get(option.value)}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    className="justify-center text-center"
                    onSelect={() => onChange(undefined)}
                  >
                    清除筛选
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
