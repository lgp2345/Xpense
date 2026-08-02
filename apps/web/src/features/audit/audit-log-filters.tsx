export type AuditLogSearch = {
  action?: string;
  actorUserId?: string;
  from?: string;
  page?: number;
  targetType?: string;
  to?: string;
};

type AuditLogFiltersProps = {
  search: AuditLogSearch;
  onChange: (search: AuditLogSearch) => void;
};

type FilterField = Exclude<keyof AuditLogSearch, "page">;

const fields: Array<{ key: FilterField; label: string; type?: "date" }> = [
  { key: "action", label: "操作" },
  { key: "actorUserId", label: "操作人 ID" },
  { key: "targetType", label: "目标类型" },
  { key: "from", label: "开始日期", type: "date" },
  { key: "to", label: "结束日期", type: "date" },
];

export function AuditLogFilters({ search, onChange }: AuditLogFiltersProps) {
  function updateFilter(field: FilterField, value: string) {
    const nextSearch = { ...search, page: undefined, [field]: value || undefined };
    onChange(removeEmptySearchValues(nextSearch));
  }

  return (
    <fieldset className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <legend className="sr-only">筛选审计日志</legend>
      {fields.map(({ key, label, type = "text" }) => (
        <label className="grid gap-1 text-sm text-[var(--color-ink-muted)]" key={key}>
          {label}
          <input
            aria-label={label}
            className="min-h-10 rounded-[var(--xp-radius-control)] border border-[var(--color-line)] bg-[var(--color-surface-solid)] px-3 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-line-strong)]"
            type={type}
            value={search[key] ?? ""}
            onChange={(event) => updateFilter(key, event.currentTarget.value)}
          />
        </label>
      ))}
    </fieldset>
  );
}

function removeEmptySearchValues(search: AuditLogSearch): AuditLogSearch {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== undefined && value !== ""),
  ) as AuditLogSearch;
}
