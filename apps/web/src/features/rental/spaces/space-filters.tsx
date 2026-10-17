import { useForm, useStore } from "@tanstack/react-form";
import type { RentalLeaseStatus } from "@xpense/shared";
import { useCallback, useEffect } from "react";
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

export type SpaceFiltersValue = {
  keyword?: string;
  effectiveStatus?: "active" | "inactive";
  leaseStatus?: RentalLeaseStatus;
};
export function SpaceFilters({
  keyword,
  effectiveStatus,
  leaseStatus,
  onChange,
}: SpaceFiltersValue & {
  onChange: (value: SpaceFiltersValue) => void;
}) {
  const form = useForm({
    defaultValues: { draft: toDraft({ keyword, effectiveStatus, leaseStatus }) },
  });
  const draft = useStore(form.store, (state) => state.values.draft);
  const setDraft = useCallback(
    (next: typeof draft | ((current: typeof draft) => typeof draft)) =>
      form.setFieldValue("draft", next),
    [form],
  );
  useEffect(() => {
    setDraft(toDraft({ keyword, effectiveStatus, leaseStatus }));
  }, [keyword, effectiveStatus, leaseStatus, setDraft]);
  return (
    <FilterPanel>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onChange({
            keyword: draft.keyword.trim() || undefined,
            effectiveStatus: draft.effectiveStatus === "all" ? undefined : draft.effectiveStatus,
            leaseStatus: draft.leaseStatus === "all" ? undefined : draft.leaseStatus,
          });
        }}
      >
        <FilterFields>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="space-search">搜索空间</FieldLabel>
            <Input
              id="space-search"
              placeholder="按名称或编码搜索空间"
              value={draft.keyword}
              onChange={(event) =>
                setDraft((current) => ({ ...current, keyword: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="space-effective-filter">有效状态</FieldLabel>
            <Select
              value={draft.effectiveStatus}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  effectiveStatus: value as typeof draft.effectiveStatus,
                }))
              }
            >
              <SelectTrigger
                id="space-effective-filter"
                aria-label="空间有效状态"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部有效状态</SelectItem>
                <SelectItem value="active">有效</SelectItem>
                <SelectItem value="inactive">无效</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="space-lease-filter">租赁状态</FieldLabel>
            <Select
              value={draft.leaseStatus}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  leaseStatus: value as typeof draft.leaseStatus,
                }))
              }
            >
              <SelectTrigger id="space-lease-filter" aria-label="空间租赁状态" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部租赁状态</SelectItem>
                {(
                  [
                    ["vacant", "空置"],
                    ["upcoming", "即将出租"],
                    ["active", "出租中"],
                    ["expiring_soon", "即将到期"],
                  ] as const
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FilterActions>
            <Button type="submit">应用筛选</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(toDraft({}));
                onChange({});
              }}
            >
              清空
            </Button>
          </FilterActions>
        </FilterFields>
      </form>
    </FilterPanel>
  );
}

function toDraft(filters: SpaceFiltersValue): {
  keyword: string;
  effectiveStatus: "all" | NonNullable<SpaceFiltersValue["effectiveStatus"]>;
  leaseStatus: "all" | RentalLeaseStatus;
} {
  return {
    keyword: filters.keyword ?? "",
    effectiveStatus: filters.effectiveStatus ?? "all",
    leaseStatus: filters.leaseStatus ?? "all",
  };
}
