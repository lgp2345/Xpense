import { useForm, useStore } from "@tanstack/react-form";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { useEffect, useId } from "react";

import { FilterActions, FilterFields, FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import MultipleSelector from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableFacetedFilter } from "./faceted-filter";
import { DataTableViewOptions } from "./view-options";

type DataTableToolbarProps = {
  // biome-ignore lint/suspicious/noExplicitAny: tanstack v9 type system requires any for generic components
  table: any;
  searchPlaceholder?: string;
  searchKey?: string;
  filters?: {
    columnId: string;
    mode?: "single" | "multiple";
    allLabel?: string;
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
  const id = useId();
  const appliedColumns = table.state.columnFilters as ColumnFiltersState;
  const appliedKeyword = (table.state.globalFilter as string) ?? "";
  const form = useForm({
    defaultValues: { columns: appliedColumns, keyword: appliedKeyword },
    onSubmit: ({ value }) => {
      table.setColumnFilters(value.columns);
      table.setGlobalFilter(value.keyword);
    },
  });
  const draft = useStore(form.store, (state) => state.values);
  useEffect(() => {
    form.reset({ columns: appliedColumns, keyword: appliedKeyword });
  }, [form, appliedColumns, appliedKeyword]);
  function setColumn(id: string, value: unknown) {
    form.setFieldValue("columns", (current) => [
      ...current.filter((filter) => filter.id !== id),
      ...(value === undefined || value === "" ? [] : [{ id, value }]),
    ]);
  }

  return (
    <FilterPanel actions={<DataTableViewOptions table={table} />}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FilterFields>
          <Field>
            <FieldLabel htmlFor={`${id}-search`}>关键词</FieldLabel>
            {searchKey ? (
              <Input
                id={`${id}-search`}
                placeholder={searchPlaceholder}
                value={
                  (draft.columns.find((filter) => filter.id === searchKey)?.value as string) ?? ""
                }
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setColumn(searchKey, event.target.value)
                }
              />
            ) : (
              <Input
                id={`${id}-search`}
                placeholder={searchPlaceholder}
                value={draft.keyword}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  form.setFieldValue("keyword", event.target.value)
                }
              />
            )}
          </Field>
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;
            return (
              <Field key={filter.columnId}>
                <FieldLabel htmlFor={`${id}-${filter.columnId}`}>{filter.title}</FieldLabel>
                {filter.mode === "single" ? (
                  <Select
                    value={
                      (draft.columns.find((item) => item.id === filter.columnId)
                        ?.value as string) ?? "all"
                    }
                    onValueChange={(value) =>
                      setColumn(filter.columnId, value === "all" ? undefined : value)
                    }
                  >
                    <SelectTrigger
                      id={`${id}-${filter.columnId}`}
                      aria-label={filter.title}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{filter.allLabel ?? "全部"}</SelectItem>
                      {filter.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : filter.mode === "multiple" ? (
                  <MultipleSelector
                    commandProps={{ label: filter.title }}
                    className="min-h-9"
                    badgeClassName="max-w-full h-auto min-h-7 whitespace-normal break-all"
                    options={[
                      ...(filter.allLabel ? [{ value: "all", label: filter.allLabel }] : []),
                      ...filter.options.map(({ label, value }) => ({ label, value })),
                    ]}
                    value={filter.options
                      .filter((option) =>
                        (
                          (draft.columns.find((item) => item.id === filter.columnId)
                            ?.value as string[]) ?? []
                        ).includes(option.value),
                      )
                      .map(({ label, value }) => ({ label, value }))}
                    onChange={(options) =>
                      setColumn(
                        filter.columnId,
                        options.some((option) => option.value === "all") || options.length === 0
                          ? undefined
                          : options.map((option) => option.value),
                      )
                    }
                    placeholder={filter.allLabel ?? "请选择"}
                    hidePlaceholderWhenSelected
                    inputProps={{
                      id: `${id}-${filter.columnId}`,
                      "aria-label": filter.title,
                      className: "min-w-0 w-0 text-base md:text-sm",
                    }}
                    emptyIndicator="没有匹配选项"
                  />
                ) : (
                  <DataTableFacetedFilter
                    id={`${id}-${filter.columnId}`}
                    column={column}
                    value={
                      (draft.columns.find((item) => item.id === filter.columnId)
                        ?.value as string[]) ?? []
                    }
                    onChange={(value) => setColumn(filter.columnId, value)}
                    options={filter.options}
                    title={filter.title}
                  />
                )}
              </Field>
            );
          })}
          <FilterActions>
            <Button type="submit">查询</Button>
            <Button
              variant="outline"
              onClick={() => {
                form.reset({ columns: [], keyword: "" });
                table.resetColumnFilters();
                table.setGlobalFilter("");
              }}
            >
              重置
            </Button>
          </FilterActions>
        </FilterFields>
      </form>
    </FilterPanel>
  );
}
