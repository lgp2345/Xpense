import { useForm, useStore } from "@tanstack/react-form";
import { useEffect, useId } from "react";
import { z } from "zod";
import { FilterActions, FilterFields, FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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
  onApply,
}: {
  values: ContractBillFiltersValue;
  onApply: (value: ContractBillFiltersValue) => void;
}) {
  const id = useId();
  const form = useForm({
    defaultValues: values,
    validators: { onSubmit: contractBillFiltersSchema },
    onSubmit: ({ value }) => onApply(value),
  });
  const draft = useStore(form.store, (state) => state.values);
  useEffect(
    () => form.reset({ type: values.type, status: values.status }),
    [form, values.type, values.status],
  );
  return (
    <FilterPanel>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FilterFields>
          <Field>
            <FieldLabel htmlFor={`${id}-type`}>合同账单费用</FieldLabel>
            <Select
              value={draft.type}
              onValueChange={(value) =>
                form.setFieldValue("type", value as ContractBillFiltersValue["type"])
              }
            >
              <SelectTrigger id={`${id}-type`} aria-label="合同账单费用" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部费用</SelectItem>
                <SelectItem value="period">账期账单</SelectItem>
                <SelectItem value="deposit">押金</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-status`}>合同账单状态</FieldLabel>
            <Select
              value={draft.status}
              onValueChange={(value) =>
                form.setFieldValue("status", value as ContractBillFiltersValue["status"])
              }
            >
              <SelectTrigger id={`${id}-status`} aria-label="合同账单状态" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">有效</SelectItem>
                <SelectItem value="voided">作废历史</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <FilterActions>
            <Button type="submit">查询</Button>
            <Button
              variant="outline"
              onClick={() => {
                const defaults: ContractBillFiltersValue = { type: "all", status: "active" };
                form.setFieldValue("type", defaults.type);
                form.setFieldValue("status", defaults.status);
                onApply(defaults);
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
