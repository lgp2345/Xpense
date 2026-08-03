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

const fields: Array<{ key: FilterField; label: string; type?: "date" }> = [
  { key: "action", label: "操作" },
  { key: "actorUserId", label: "操作人 ID" },
  { key: "targetType", label: "目标类型" },
  { key: "from", label: "开始日期", type: "date" },
  { key: "to", label: "结束日期", type: "date" },
];

export function AuditLogFilters({ onChange, search }: AuditLogFiltersProps) {
  function updateFilter(field: FilterField, value: string) {
    const nextSearch = { ...search, page: undefined, [field]: value || undefined };
    onChange(removeEmptySearchValues(nextSearch));
  }

  return (
    <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <legend className="sr-only">筛选审计日志</legend>
      {fields.map(({ key, label, type = "text" }) => (
        <div className="grid gap-2" key={key}>
          <Label htmlFor={`audit-${key}`}>{label}</Label>
          <Input
            id={`audit-${key}`}
            type={type}
            value={search[key] ?? ""}
            onChange={(event) => updateFilter(key, event.currentTarget.value)}
          />
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
