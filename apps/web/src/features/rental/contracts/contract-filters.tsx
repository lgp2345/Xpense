import type { RentalContractDisplayStatus } from "@xpense/shared";
import { useEffect, useState } from "react";
import { DateRangePicker, type DateRangeValue } from "@/components/date-picker";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [draft, setDraft] = useState(() => toDraft(search));
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
    <form
      className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply({ ...compact(draft), page: 1, pageSize: search.pageSize ?? 20 });
      }}
    >
      <label htmlFor="contract-filter-keyword" className="space-y-1 text-sm">
        <span>合同号或外部编号</span>
        <Input
          id="contract-filter-keyword"
          name="keyword"
          aria-label="合同号或外部编号"
          value={draft.keyword}
          onChange={(event) => setDraft((value) => ({ ...value, keyword: event.target.value }))}
        />
      </label>
      <label htmlFor="contract-filter-property" className="space-y-1 text-sm">
        <span>房产</span>
        <Input
          id="contract-filter-property"
          name="propertyId"
          aria-label="房产"
          value={draft.propertyId}
          onChange={(event) => setDraft((value) => ({ ...value, propertyId: event.target.value }))}
        />
      </label>
      <label htmlFor="contract-filter-tenant" className="space-y-1 text-sm">
        <span>租户</span>
        <Input
          id="contract-filter-tenant"
          name="tenantId"
          aria-label="租户"
          value={draft.tenantId}
          onChange={(event) => setDraft((value) => ({ ...value, tenantId: event.target.value }))}
        />
      </label>
      <label htmlFor="contract-filter-status" className="space-y-1 text-sm">
        <span>状态</span>
        <select
          id="contract-filter-status"
          name="status"
          aria-label="合同状态"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={draft.status}
          onChange={(event) =>
            setDraft((value) => ({
              ...value,
              status: event.target.value as RentalContractDisplayStatus | "",
            }))
          }
        >
          <option value="">全部状态</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {CONTRACT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
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
    </form>
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
    <label htmlFor={`contract-filter-${label}`} className="space-y-1 text-sm">
      <span>{label}</span>
      <DateRangePicker
        id={`contract-filter-${label}`}
        aria-label={label}
        value={value}
        onChange={onChange}
        placeholder={`选择${label}`}
      />
    </label>
  );
}
