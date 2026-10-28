import { useForm, useStore } from "@tanstack/react-form";
import type { RentalContractDisplayStatus } from "@xpense/shared";
import { useCallback, useEffect } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { FilterActions, FilterFields, FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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
  propertyScoped = false,
}: {
  propertyScoped?: boolean;
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
        <FilterFields>
          <Field>
            <FieldLabel htmlFor="contract-filter-keyword">
              <span>{propertyScoped ? "合同号、空间名称或承租人" : "合同号或外部编号"}</span>
            </FieldLabel>
            <Input
              id="contract-filter-keyword"
              name="keyword"
              aria-label={propertyScoped ? "合同号、空间名称或承租人" : "合同号或外部编号"}
              value={draft.keyword}
              onChange={(event) => setDraft((value) => ({ ...value, keyword: event.target.value }))}
            />
          </Field>
          {!propertyScoped ? (
            <>
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
            </>
          ) : null}
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
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="contract-filter-date-range">租期范围</FieldLabel>
            <DateRangePicker
              id="contract-filter-date-range"
              aria-label="租期范围"
              placeholder="选择租期范围"
              value={{ from: draft.startDateFrom, to: draft.endDateTo }}
              onChange={({ from, to }) =>
                setDraft((draft) => ({ ...draft, startDateFrom: from ?? "", endDateTo: to ?? "" }))
              }
            />
          </Field>
          <FilterActions>
            <Button type="submit">查询</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(toDraft({}));
                onApply({ page: 1, pageSize: search.pageSize ?? 20 });
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

type FilterDraft = Record<
  "keyword" | "propertyId" | "tenantId" | "status" | "startDateFrom" | "endDateTo",
  string
>;

function toDraft(search: ListRentalContractsQuery): FilterDraft {
  return {
    keyword: search.keyword ?? "",
    propertyId: search.propertyId ?? "",
    tenantId: search.tenantId ?? "",
    status: search.status ?? "",
    startDateFrom: search.startDateFrom ?? "",
    endDateTo: search.endDateTo ?? "",
  };
}

function compact(draft: FilterDraft): ListRentalContractsQuery {
  return Object.fromEntries(
    Object.entries(draft).filter(([, value]) => value.trim() !== ""),
  ) as ListRentalContractsQuery;
}
