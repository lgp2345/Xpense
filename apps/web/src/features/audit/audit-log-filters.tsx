import { DateRangePicker, type DateRangeValue } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <legend className="sr-only">筛选审计日志</legend>
      {fields.map((field) => (
        <div className="grid gap-2" key={field.key}>
          <Label htmlFor={`audit-${field.key}`}>{field.label}</Label>
          <Input
            id={`audit-${field.key}`}
            value={search[field.key] ?? ""}
            onChange={(event) => updateFilter(field.key, event.currentTarget.value)}
          />
        </div>
      ))}
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="audit-date-range">日期范围</Label>
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
      </div>
    </fieldset>
  );
}

function removeEmptySearchValues(search: AuditLogSearch): AuditLogSearch {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== ""),
  ) as AuditLogSearch;
}
