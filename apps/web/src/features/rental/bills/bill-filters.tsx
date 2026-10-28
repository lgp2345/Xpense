import { useForm, useStore } from "@tanstack/react-form";
import type { ListRentalBillsQuery } from "@xpense/shared";
import { z } from "zod";
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
import { isCalendarDate } from "../contracts/contract-action-model";

export { validateRentalBillsSearch } from "./bill-search";

import { validateRentalBillsSearch } from "./bill-search";

const date = z.string().refine((value) => !value || isCalendarDate(value));
const schema = z
  .object({
    keyword: z.string(),
    contractId: z.string(),
    propertyId: z.string(),
    type: z.enum(["all", "period", "deposit"]),
    status: z.enum(["active", "voided"]),
    dueDateFrom: date,
    dueDateTo: date,
  })
  .refine(
    (value) => !value.dueDateFrom || !value.dueDateTo || value.dueDateFrom <= value.dueDateTo,
    { message: "到期日范围无效", path: ["dueDateTo"] },
  );
export function BillFilters(props: {
  search: ListRentalBillsQuery;
  onChange: (query: ListRentalBillsQuery) => void;
}) {
  return <FilterForm key={JSON.stringify(props.search)} {...props} />;
}
function FilterForm({
  search,
  onChange,
}: {
  search: ListRentalBillsQuery;
  onChange: (query: ListRentalBillsQuery) => void;
}) {
  const form = useForm({
    defaultValues: {
      keyword: search.keyword ?? "",
      contractId: search.contractId ?? "",
      propertyId: search.propertyId ?? "",
      type: search.type ?? "all",
      status: search.status ?? "active",
      dueDateFrom: search.dueDateFrom ?? "",
      dueDateTo: search.dueDateTo ?? "",
    },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      onChange({ ...validateRentalBillsSearch(value), page: 1, pageSize: search.pageSize ?? 20 }),
  });
  const values = useStore(form.store, (state) => state.values);
  const errors = useStore(form.store, (state) => state.errors);
  return (
    <FilterPanel>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FilterFields>
          {(
            [
              ["keyword", "关键词"],
              ["contractId", "合同 ID"],
              ["propertyId", "房产 ID"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key}>
              <FieldLabel htmlFor={`bill-filter-${key}`}>{label}</FieldLabel>
              <Input
                id={`bill-filter-${key}`}
                value={values[key]}
                onChange={(event) => form.setFieldValue(key, event.target.value)}
              />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="bill-filter-type">费用分类</FieldLabel>
            <Select
              value={values.type}
              onValueChange={(value) => form.setFieldValue("type", value as typeof values.type)}
            >
              <SelectTrigger id="bill-filter-type" className="w-full">
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
            <FieldLabel htmlFor="bill-filter-status">账单状态</FieldLabel>
            <Select
              value={values.status}
              onValueChange={(value) => form.setFieldValue("status", value as typeof values.status)}
            >
              <SelectTrigger id="bill-filter-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">有效</SelectItem>
                <SelectItem value="voided">作废</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="bill-due-date-range">到期日范围</FieldLabel>
            <DateRangePicker
              id="bill-due-date-range"
              aria-label="到期日范围"
              placeholder="选择到期日范围"
              value={{ from: values.dueDateFrom, to: values.dueDateTo }}
              onChange={({ from, to }) => {
                form.setFieldValue("dueDateFrom", from ?? "");
                form.setFieldValue("dueDateTo", to ?? "");
              }}
            />
          </Field>
          <FilterActions>
            <Button type="submit">查询</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.setFieldValue("keyword", "");
                form.setFieldValue("contractId", "");
                form.setFieldValue("propertyId", "");
                form.setFieldValue("type", "all");
                form.setFieldValue("status", "active");
                form.setFieldValue("dueDateFrom", "");
                form.setFieldValue("dueDateTo", "");
                onChange({ status: "active", page: 1, pageSize: search.pageSize ?? 20 });
              }}
            >
              重置
            </Button>
          </FilterActions>
        </FilterFields>
        {errors.length ? (
          <p role="alert" className="text-sm text-destructive">
            请检查到期日范围，开始日期不得晚于结束日期。
          </p>
        ) : null}
      </form>
    </FilterPanel>
  );
}
