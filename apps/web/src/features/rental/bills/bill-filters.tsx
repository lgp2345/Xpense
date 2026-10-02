import { useForm, useStore } from "@tanstack/react-form";
import type { ListRentalBillsQuery } from "@xpense/shared";
import { z } from "zod";
import { DatePickerInput } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isCalendarDate } from "../contracts/contract-action-model";

export { validateRentalBillsSearch } from "./bill-search";

import { validateRentalBillsSearch } from "./bill-search";

const date = z.string().refine((value) => !value || isCalendarDate(value));
const schema = z
  .object({
    keyword: z.string(),
    contractId: z.string(),
    propertyId: z.string(),
    type: z.enum(["all", "rent", "deposit", "monthly"]),
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
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["keyword", "关键词"],
            ["contractId", "合同 ID"],
            ["propertyId", "房产 ID"],
          ] as const
        ).map(([key, label]) => (
          <label className="space-y-1 text-sm" key={key} htmlFor={`bill-filter-${key}`}>
            <span>{label}</span>
            <Input
              id={`bill-filter-${key}`}
              value={values[key]}
              onChange={(event) => form.setFieldValue(key, event.target.value)}
            />
          </label>
        ))}
        <label className="space-y-1 text-sm">
          <span>费用分类</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={values.type}
            onChange={(event) =>
              form.setFieldValue("type", event.target.value as typeof values.type)
            }
          >
            <option value="all">全部费用</option>
            <option value="rent">租金</option>
            <option value="deposit">押金</option>
            <option value="monthly">月度综合账单</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>账单状态</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={values.status}
            onChange={(event) =>
              form.setFieldValue("status", event.target.value as typeof values.status)
            }
          >
            <option value="active">有效</option>
            <option value="voided">作废</option>
          </select>
        </label>
        <div className="space-y-1 text-sm">
          <label htmlFor="bill-date-from">到期日起</label>
          <DatePickerInput
            id="bill-date-from"
            value={values.dueDateFrom}
            onChange={(value) => form.setFieldValue("dueDateFrom", value ?? "")}
          />
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="bill-date-to">到期日止</label>
          <DatePickerInput
            id="bill-date-to"
            value={values.dueDateTo}
            onChange={(value) => form.setFieldValue("dueDateTo", value ?? "")}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">查询</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange({ status: "active", page: 1, pageSize: search.pageSize ?? 20 })}
          >
            重置
          </Button>
        </div>
      </div>
      {errors.length ? (
        <p role="alert" className="text-sm text-destructive">
          请检查到期日范围，开始日期不得晚于结束日期。
        </p>
      ) : null}
    </form>
  );
}
