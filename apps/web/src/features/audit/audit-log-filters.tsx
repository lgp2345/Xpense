import { DateRangePicker, type DateRangeValue } from "@/components/date-picker";
import { FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type AuditLogSearch = {
  action?: string;
  actorUserId?: string;
  from?: string;
  page?: number;
  pageSize?: number;
  targetType?: string;
  to?: string;
};

type AuditLogFiltersProps = {
  onChange: (search: AuditLogSearch) => void;
  search: AuditLogSearch;
};

type FilterField = Exclude<keyof AuditLogSearch, "page" | "pageSize">;

const fields = [
  { key: "action", label: "操作" },
  { key: "actorUserId", label: "操作人 ID" },
  { key: "targetType", label: "目标类型" },
] as const satisfies ReadonlyArray<{
  key: FilterField;
  label: string;
}>;

export function AuditLogFilters({ onChange, search }: AuditLogFiltersProps) {
  function updateFilter(field: FilterField, value: string) {
    const nextSearch = { ...search, page: undefined, [field]: value || undefined };
    onChange(removeEmptySearchValues(nextSearch));
  }

  function updateDateRange(value: DateRangeValue) {
    onChange(
      removeEmptySearchValues({
        ...search,
        page: undefined,
        from: value.from,
        to: value.to,
      }),
    );
  }

  return (
    <FilterPanel>
      <FieldSet className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <FieldLegend className="sr-only">筛选审计日志</FieldLegend>
        {fields.map((field) => (
          <Field key={field.key}>
            <FieldLabel htmlFor={`audit-${field.key}`}>{field.label}</FieldLabel>
            <Input
              id={`audit-${field.key}`}
              value={search[field.key] ?? ""}
              onChange={(event) => updateFilter(field.key, event.currentTarget.value)}
            />
          </Field>
        ))}
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="audit-date-range">日期范围</FieldLabel>
          <div className="flex gap-2">
            <DateRangePicker
              id="audit-date-range"
              aria-label="日期范围"
              value={{ from: search.from, to: search.to }}
              onChange={updateDateRange}
              className="min-w-0 flex-1"
            />
            {search.from || search.to ? (
              <Button
                type="button"
                variant="outline"
                aria-label="清除日期范围"
                onClick={() => updateDateRange({})}
              >
                清除
              </Button>
            ) : null}
          </div>
        </Field>
      </FieldSet>
    </FilterPanel>
  );
}

function removeEmptySearchValues(search: AuditLogSearch): AuditLogSearch {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== ""),
  ) as AuditLogSearch;
}
