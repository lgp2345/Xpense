import type { RentalPropertyType } from "@xpense/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ListRentalPropertiesQuery } from "../../../services/rental-api";

type PropertyFiltersProps = {
  search: ListRentalPropertiesQuery;
  onApply: (search: ListRentalPropertiesQuery) => void;
};

/** 房产筛选先维护草稿，仅在用户应用时改写 URL 查询状态。 */
export function PropertyFilters({ search, onApply }: PropertyFiltersProps) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(() => toDraft(search));
  useEffect(() => setDraft(toDraft(search)), [search]);
  function update<Key extends keyof typeof draft>(key: Key, value: (typeof draft)[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between md:hidden">
        <span className="text-sm font-medium">筛选条件</span>
        <CollapsibleTrigger asChild>
          <Button size="sm" variant="outline">
            {open ? "收起筛选" : "展开筛选"}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput
            label="关键词"
            value={draft.keyword}
            onChange={(value) => update("keyword", value)}
          />
          <FilterSelect
            label="房产类型"
            value={draft.type}
            options={[
              ["all", "全部"],
              ["residential_unit", "住宅"],
              ["detached_house", "独栋住宅"],
              ["apartment_building", "公寓楼"],
              ["commercial_building", "商业楼"],
              ["complex", "园区"],
              ["shop", "商铺"],
              ["office", "办公"],
              ["warehouse", "仓储"],
              ["other", "其他"],
            ]}
            onChange={(value) => update("type", value as RentalPropertyType | "all")}
          />
          <FilterSelect
            label="状态"
            value={draft.isActive}
            options={[
              ["all", "全部"],
              ["active", "启用"],
              ["inactive", "停用"],
            ]}
            onChange={(value) => update("isActive", value as "all" | "active" | "inactive")}
          />
          <TextInput
            label="省份"
            value={draft.province}
            onChange={(value) => update("province", value)}
          />
          <TextInput label="城市" value={draft.city} onChange={(value) => update("city", value)} />
          <TextInput
            label="区县"
            value={draft.district}
            onChange={(value) => update("district", value)}
          />
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button
              onClick={() =>
                onApply({
                  ...(draft.keyword.trim() ? { keyword: draft.keyword.trim() } : {}),
                  ...(draft.type !== "all" ? { type: draft.type } : {}),
                  ...(draft.isActive === "all" ? {} : { isActive: draft.isActive === "active" }),
                  ...(draft.province.trim() ? { province: draft.province.trim() } : {}),
                  ...(draft.city.trim() ? { city: draft.city.trim() } : {}),
                  ...(draft.district.trim() ? { district: draft.district.trim() } : {}),
                  page: undefined,
                  pageSize: search.pageSize ?? 20,
                })
              }
            >
              应用筛选
            </Button>
            <Button
              variant="outline"
              onClick={() => onApply({ page: undefined, pageSize: search.pageSize ?? 20 })}
            >
              重置
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `property-${label}`;
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function toDraft(search: ListRentalPropertiesQuery) {
  return {
    keyword: search.keyword ?? "",
    type: search.type ?? "all",
    isActive: search.isActive === undefined ? "all" : search.isActive ? "active" : "inactive",
    province: search.province ?? "",
    city: search.city ?? "",
    district: search.district ?? "",
  } as const;
}
