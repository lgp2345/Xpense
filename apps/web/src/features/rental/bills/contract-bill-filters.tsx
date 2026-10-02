import { useId } from "react";
import { z } from "zod";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const contractBillFiltersSchema = z.object({
  type: z.enum(["all", "rent", "deposit", "monthly"]),
  status: z.enum(["active", "voided"]),
});
export type ContractBillFiltersValue = z.infer<typeof contractBillFiltersSchema>;

export function ContractBillFilters({
  values,
  onTypeChange,
  onStatusChange,
  monthly = false,
}: {
  values: ContractBillFiltersValue;
  onTypeChange: (value: ContractBillFiltersValue["type"]) => void;
  onStatusChange: (value: ContractBillFiltersValue["status"]) => void;
  monthly?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-type`} className="text-xs text-muted-foreground">
          {monthly ? "账单费用" : "合同账单费用"}
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
          <SelectContent className="min-w-(--radix-select-trigger-width)">
            <SelectItem value="all">全部费用</SelectItem>
            {monthly ? (
              <SelectItem value="monthly">月度账单</SelectItem>
            ) : (
              <SelectItem value="rent">租金</SelectItem>
            )}
            <SelectItem value="deposit">押金</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-status`} className="text-xs text-muted-foreground">
          {monthly ? "账单状态" : "合同账单状态"}
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
          <SelectContent className="min-w-(--radix-select-trigger-width)">
            <SelectItem value="active">有效</SelectItem>
            <SelectItem value="voided">作废历史</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
