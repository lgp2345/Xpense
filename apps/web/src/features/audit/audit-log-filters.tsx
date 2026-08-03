import { DatePickerInput } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AuditLogSearch = {
  action?: string;
  actorUserId?: string;
  from?: string;
  page?: number;
  targetType?: string;
  to?: string;
};

type AuditLogFiltersProps = {
  onChange: (search: AuditLogSearch) => void;
  search: AuditLogSearch;
};

type FilterField = Exclude<keyof AuditLogSearch, "page">;

const fields = [
  { key: "action", label: "操作", type: "text" },
  { key: "actorUserId", label: "操作人 ID", type: "text" },
  { key: "targetType", label: "目标类型", type: "text" },
  { key: "from", label: "开始日期", type: "date" },
  { key: "to", label: "结束日期", type: "date" },
] as const satisfies ReadonlyArray<{
  key: FilterField;
  label: string;
  type: "text" | "date";
}>;

export function AuditLogFilters({ onChange, search }: AuditLogFiltersProps) {
  function updateFilter(field: FilterField, value: string) {
    const nextSearch = { ...search, page: undefined, [field]: value || undefined };
    onChange(removeEmptySearchValues(nextSearch));
  }

  return (
    <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <legend className="sr-only">筛选审计日志</legend>
      {fields.map((field) => (
        <div className="grid gap-2" key={field.key}>
          <Label htmlFor={`audit-${field.key}`}>{field.label}</Label>
          {field.type === "date" ? (
            <DatePickerInput
              id={`audit-${field.key}`}
              value={search[field.key]}
              onChange={(value) => updateFilter(field.key, value ?? "")}
              buttonLabel={`选择${field.label}`}
            />
          ) : (
            <Input
              id={`audit-${field.key}`}
              value={search[field.key] ?? ""}
              onChange={(event) => updateFilter(field.key, event.currentTarget.value)}
            />
          )}
        </div>
      ))}
    </fieldset>
  );
}

function removeEmptySearchValues(search: AuditLogSearch): AuditLogSearch {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== ""),
  ) as AuditLogSearch;
}
