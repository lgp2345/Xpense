import type { RentalContractDisplayStatus } from "@xpense/shared";
import { useEffect, useState } from "react";

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
      <DateField
        label="开始日期（从）"
        value={draft.startDateFrom}
        onChange={(value) => setDraft((draft) => ({ ...draft, startDateFrom: value }))}
      />
      <DateField
        label="开始日期（至）"
        value={draft.startDateTo}
        onChange={(value) => setDraft((draft) => ({ ...draft, startDateTo: value }))}
      />
      <DateField
        label="结束日期（从）"
        value={draft.endDateFrom}
        onChange={(value) => setDraft((draft) => ({ ...draft, endDateFrom: value }))}
      />
      <DateField
        label="结束日期（至）"
        value={draft.endDateTo}
        onChange={(value) => setDraft((draft) => ({ ...draft, endDateTo: value }))}
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

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={`contract-filter-${label}`} className="space-y-1 text-sm">
      <span>{label}</span>
      <Input
        id={`contract-filter-${label}`}
        name={label}
        aria-label={label}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
