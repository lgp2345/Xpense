import type { RentalLeaseStatus } from "@xpense/shared";
import { FilterPanel } from "@/components/filter-panel";
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
  onKeywordChange,
  onChange,
}: SpaceFiltersValue & {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onChange: (value: SpaceFiltersValue) => void;
}) {
  return (
    <FilterPanel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field className="sm:col-span-2 lg:col-span-1">
          <FieldLabel htmlFor="space-search">搜索空间</FieldLabel>
          <Input
            id="space-search"
            placeholder="按名称或编码搜索空间"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="space-effective-filter">有效状态</FieldLabel>
          <Select
            value={effectiveStatus ?? "all"}
            onValueChange={(value) =>
              onChange({
                keyword,
                effectiveStatus: value === "all" ? undefined : (value as "active" | "inactive"),
                leaseStatus,
              })
            }
          >
            <SelectTrigger id="space-effective-filter" aria-label="空间有效状态" className="w-full">
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
            value={leaseStatus ?? "all"}
            onValueChange={(value) =>
              onChange({
                keyword,
                effectiveStatus,
                leaseStatus: value === "all" ? undefined : (value as RentalLeaseStatus),
              })
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
        <Button
          type="button"
          variant="outline"
          className="self-end"
          onClick={() => {
            onKeywordChange("");
            onChange({});
          }}
        >
          清空空间筛选
        </Button>
      </div>
    </FilterPanel>
  );
}
