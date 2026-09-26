import { useForm, useStore } from "@tanstack/react-form";
import type { AccountSummary, CategoryNode, LedgerSummary, TransactionType } from "@xpense/shared";
import { useCallback, useEffect } from "react";
import { DateRangePicker } from "@/components/date-picker";
import { FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ListTransactionsQuery } from "../../../services/bookkeeping-api";

type TransactionFiltersProps = {
  accounts: AccountSummary[];
  categories: CategoryNode[];
  ledgers: LedgerSummary[];
  search: ListTransactionsQuery;
  onApply: (search: ListTransactionsQuery) => void;
};

/** 渲染可折叠筛选器；应用时将唯一生效状态写回 URL。 */
export function TransactionFilters({
  accounts,
  categories,
  ledgers,
  onApply,
  search,
}: TransactionFiltersProps) {
  const form = useForm({ defaultValues: { draft: toDraft(search) } });
  const draft = useStore(form.store, (state) => state.values.draft);
  const setDraft = useCallback(
    (next: typeof draft | ((current: typeof draft) => typeof draft)) =>
      form.setFieldValue("draft", next),
    [form],
  );

  useEffect(() => setDraft(toDraft(search)), [search, setDraft]);

  /** 更新一个尚未应用的筛选输入。 */
  function update<Key extends keyof typeof draft>(key: Key, value: (typeof draft)[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <FilterPanel>
      <FieldGroup className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="transaction-keyword">关键词</FieldLabel>
          <Input
            id="transaction-keyword"
            value={draft.keyword}
            onChange={(event) => update("keyword", event.target.value)}
          />
        </Field>
        <FilterSelect
          label="交易类型"
          value={draft.type}
          options={[
            ["all", "全部"],
            ["expense", "支出"],
            ["income", "收入"],
            ["transfer", "转账"],
          ]}
          onChange={(value) => update("type", value as TransactionType | "all")}
        />
        <FilterSelect
          label="筛选账本"
          value={draft.ledgerId}
          options={[["all", "全部"], ...ledgers.map((item) => [item.id, item.name] as const)]}
          onChange={(value) => update("ledgerId", value)}
        />
        <FilterSelect
          label="筛选账户"
          value={draft.accountId}
          options={[["all", "全部"], ...accounts.map((item) => [item.id, item.name] as const)]}
          onChange={(value) => update("accountId", value)}
        />
        <FilterSelect
          label="筛选分类"
          value={draft.categoryId}
          options={[
            ["all", "全部"],
            ...categories
              .flatMap((item) => [item, ...item.children])
              .map((item) => [item.id, item.name] as const),
          ]}
          onChange={(value) => update("categoryId", value)}
        />
        <Field>
          <FieldLabel htmlFor="transaction-date-range">日期范围</FieldLabel>
          <DateRangePicker
            id="transaction-date-range"
            aria-label="日期范围"
            value={{ from: draft.from || undefined, to: draft.to || undefined }}
            onChange={({ from, to }) =>
              setDraft((current) => ({ ...current, from: from ?? "", to: to ?? "" }))
            }
          />
        </Field>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
          <Button
            onClick={() =>
              onApply({
                ...(draft.keyword.trim() ? { keyword: draft.keyword.trim() } : {}),
                ...(draft.type !== "all" ? { type: draft.type } : {}),
                ...(draft.ledgerId !== "all" ? { ledgerId: draft.ledgerId } : {}),
                ...(draft.accountId !== "all" ? { accountId: draft.accountId } : {}),
                ...(draft.categoryId !== "all" ? { categoryId: draft.categoryId } : {}),
                ...(draft.from ? { from: draft.from } : {}),
                ...(draft.to ? { to: draft.to } : {}),
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
      </FieldGroup>
    </FilterPanel>
  );
}

/** 渲染筛选区的通用选择框。 */
function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-full">
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
    </Field>
  );
}

/** 将 URL 筛选转换为可编辑草稿，未应用前不触发查询。 */
function toDraft(search: ListTransactionsQuery) {
  return {
    keyword: search.keyword ?? "",
    type: search.type ?? "all",
    ledgerId: search.ledgerId ?? "all",
    accountId: search.accountId ?? "all",
    categoryId: search.categoryId ?? "all",
    from: search.from ?? "",
    to: search.to ?? "",
  } as const;
}
