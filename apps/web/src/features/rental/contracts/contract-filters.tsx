import { useForm, useStore } from "@tanstack/react-form";
import type { RentalContractDisplayStatus } from "@xpense/shared";
import { useCallback, useEffect } from "react";
import { DateRangePicker, type DateRangeValue } from "@/components/date-picker";
import { FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ListRentalContractsQuery } from "../../../services/rental-api";
import { CONTRACT_STATUS_LABELS } from "./contract-status";

const statuses: RentalContractDisplayStatus[] = [
  "draft",
  "upcoming",
  "active",
  "expiring_soon",
  "expired",
  "cancelled",
  "terminated",
];

export function ContractFilters({
  search,
  onApply,
}: {
  search: ListRentalContractsQuery;
  onApply: (search: ListRentalContractsQuery) => void;
}) {
  const form = useForm({ defaultValues: { draft: toDraft(search) } });
  const draft = useStore(form.store, (state) => state.values.draft);
  const setDraft = useCallback(
    (next: typeof draft | ((current: typeof draft) => typeof draft)) =>
      form.setFieldValue("draft", next),
    [form],
  );
  useEffect(() => {
    setDraft(
      toDraft({
        keyword: search.keyword,
        propertyId: search.propertyId,
        tenantId: search.tenantId,
        status: search.status,
        startDateFrom: search.startDateFrom,
        startDateTo: search.startDateTo,
        endDateFrom: search.endDateFrom,
        endDateTo: search.endDateTo,
      }),
    );
  }, [
    setDraft,
    search.keyword,
    search.propertyId,
    search.tenantId,
    search.status,
    search.startDateFrom,
    search.startDateTo,
    search.endDateFrom,
    search.endDateTo,
  ]);
  return (
    <FilterPanel>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply({ ...compact(draft), page: 1, pageSize: search.pageSize ?? 20 });
        }}
      >
        <FieldGroup className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="contract-filter-keyword">
              <span>合同号或外部编号</span>
            </FieldLabel>
            <Input
              id="contract-filter-keyword"
              name="keyword"
              aria-label="合同号或外部编号"
              value={draft.keyword}
              onChange={(event) => setDraft((value) => ({ ...value, keyword: event.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contract-filter-property">
              <span>房产</span>
            </FieldLabel>
            <Input
              id="contract-filter-property"
              name="propertyId"
              aria-label="房产"
              value={draft.propertyId}
              onChange={(event) =>
                setDraft((value) => ({ ...value, propertyId: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contract-filter-tenant">
              <span>租户</span>
            </FieldLabel>
            <Input
              id="contract-filter-tenant"
              name="tenantId"
              aria-label="租户"
              value={draft.tenantId}
              onChange={(event) =>
                setDraft((value) => ({ ...value, tenantId: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contract-filter-status">状态</FieldLabel>
            <Select
              name="status"
              value={draft.status || "all"}
              onValueChange={(status) =>
                setDraft((value) => ({
                  ...value,
                  status: status === "all" ? "" : (status as RentalContractDisplayStatus),
                }))
              }
            >
              <SelectTrigger id="contract-filter-status" aria-label="合同状态" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {CONTRACT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DateRangeField
            label="开始日期范围"
            value={{ from: draft.startDateFrom, to: draft.startDateTo }}
            onChange={({ from, to }) =>
              setDraft((draft) => ({ ...draft, startDateFrom: from ?? "", startDateTo: to ?? "" }))
            }
          />
          <DateRangeField
            label="结束日期范围"
            value={{ from: draft.endDateFrom, to: draft.endDateTo }}
            onChange={({ from, to }) =>
              setDraft((draft) => ({ ...draft, endDateFrom: from ?? "", endDateTo: to ?? "" }))
            }
          />
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit">应用筛选</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onApply({ page: 1, pageSize: search.pageSize ?? 20 })}
            >
              清空
            </Button>
          </div>
        </FieldGroup>
      </form>
    </FilterPanel>
  );
}

type FilterDraft = Record<
  | "keyword"
  | "propertyId"
  | "tenantId"
  | "status"
  | "startDateFrom"
  | "startDateTo"
  | "endDateFrom"
  | "endDateTo",
  string
>;

function toDraft(search: ListRentalContractsQuery): FilterDraft {
  return {
    keyword: search.keyword ?? "",
    propertyId: search.propertyId ?? "",
    tenantId: search.tenantId ?? "",
    status: search.status ?? "",
    startDateFrom: search.startDateFrom ?? "",
    startDateTo: search.startDateTo ?? "",
    endDateFrom: search.endDateFrom ?? "",
    endDateTo: search.endDateTo ?? "",
  };
}

function compact(draft: FilterDraft): ListRentalContractsQuery {
  return Object.fromEntries(
    Object.entries(draft).filter(([, value]) => value.trim() !== ""),
  ) as ListRentalContractsQuery;
}

function DateRangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`contract-filter-${label}`}>
        <span>{label}</span>
      </FieldLabel>
      <DateRangePicker
        id={`contract-filter-${label}`}
        aria-label={label}
        value={value}
        onChange={onChange}
        placeholder={`选择${label}`}
      />
    </Field>
  );
}
