import { useForm, useStore } from "@tanstack/react-form";
import { type ReactNode, useEffect } from "react";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { FilterActions, FilterFields, FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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
  actions?: ReactNode;
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

export function AuditLogFilters({ actions, onChange, search }: AuditLogFiltersProps) {
  const form = useForm({
    defaultValues: toDraft(search),
    onSubmit: ({ value }) =>
      onChange(removeEmptySearchValues({ ...search, ...value, page: undefined })),
  });
  const draft = useStore(form.store, (state) => state.values);
  useEffect(
    () =>
      form.reset({
        action: search.action,
        actorUserId: search.actorUserId,
        targetType: search.targetType,
        from: search.from,
        to: search.to,
      }),
    [form, search.action, search.actorUserId, search.targetType, search.from, search.to],
  );
  function updateFilter(field: FilterField, value: string) {
    form.setFieldValue(field, value || undefined);
  }
  function updateDateRange(value: DateRangeValue) {
    form.setFieldValue("from", value.from);
    form.setFieldValue("to", value.to);
  }

  return (
    <FilterPanel actions={actions}>
      <form
        aria-label="筛选审计日志"
        className="min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FilterFields>
          {fields.map((field) => (
            <Field key={field.key}>
              <FieldLabel htmlFor={`audit-${field.key}`}>{field.label}</FieldLabel>
              <Input
                id={`audit-${field.key}`}
                value={draft[field.key] ?? ""}
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
                value={{ from: draft.from, to: draft.to }}
                onChange={updateDateRange}
                className="min-w-0 flex-1"
              />
              {draft.from || draft.to ? (
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
          <FilterActions>
            <Button type="submit">查询</Button>
            <Button
              variant="outline"
              onClick={() => {
                form.setFieldValue("action", undefined);
                form.setFieldValue("actorUserId", undefined);
                form.setFieldValue("targetType", undefined);
                updateDateRange({});
                onChange({ pageSize: search.pageSize, page: undefined });
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

function removeEmptySearchValues(search: AuditLogSearch): AuditLogSearch {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== ""),
  ) as AuditLogSearch;
}

function toDraft(search: AuditLogSearch) {
  return {
    action: search.action,
    actorUserId: search.actorUserId,
    targetType: search.targetType,
    from: search.from,
    to: search.to,
  };
}
