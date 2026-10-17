import { useId } from "react";
import { z } from "zod";
import { FilterFields, FilterPanel } from "@/components/filter-panel";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const contractBillFiltersSchema = z.object({
  type: z.enum(["all", "period", "deposit"]),
  status: z.enum(["active", "voided"]),
});
export type ContractBillFiltersValue = z.infer<typeof contractBillFiltersSchema>;

export function ContractBillFilters({
  values,
  onTypeChange,
  onStatusChange,
}: {
  values: ContractBillFiltersValue;
  onTypeChange: (value: ContractBillFiltersValue["type"]) => void;
  onStatusChange: (value: ContractBillFiltersValue["status"]) => void;
}) {
  const id = useId();
  return (
    <FilterPanel>
      <FilterFields className="sm:max-w-md lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-type`} className="text-xs text-muted-foreground">
            合同账单费用
          </Label>
          <Select
            value={values.type}
            onValueChange={(value) => onTypeChange(value as ContractBillFiltersValue["type"])}
          >
            <SelectTrigger
              id={`${id}-type`}
              aria-label="合同账单费用"
              className="w-full bg-background text-base focus-visible:border-ring focus-visible:ring-ring/50 md:text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="min-w-(--anchor-width)">
              <SelectItem value="all">全部费用</SelectItem>
              <SelectItem value="period">账期账单</SelectItem>
              <SelectItem value="deposit">押金</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-status`} className="text-xs text-muted-foreground">
            合同账单状态
          </Label>
          <Select
            value={values.status}
            onValueChange={(value) => onStatusChange(value as ContractBillFiltersValue["status"])}
          >
            <SelectTrigger
              id={`${id}-status`}
              aria-label="合同账单状态"
              className="w-full bg-background text-base focus-visible:border-ring focus-visible:ring-ring/50 md:text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="min-w-(--anchor-width)">
              <SelectItem value="active">有效</SelectItem>
              <SelectItem value="voided">作废历史</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterFields>
    </FilterPanel>
  );
}
