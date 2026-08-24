import type { AccountSummary, CategoryNode, LedgerSummary, TransactionType } from "@xpense/shared";
import { useEffect, useState } from "react";
import { DatePickerInput } from "@/components/date-picker";
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
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(() => toDraft(search));

  useEffect(() => setDraft(toDraft(search)), [search]);

  /** 更新一个尚未应用的筛选输入。 */
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
          <div className="grid gap-1">
            <Label htmlFor="transaction-keyword">关键词</Label>
            <Input
              id="transaction-keyword"
              value={draft.keyword}
              onChange={(event) => update("keyword", event.target.value)}
            />
          </div>
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
          <div className="grid gap-1">
            <Label htmlFor="transaction-from">开始日期</Label>
            <DatePickerInput
              id="transaction-from"
              value={draft.from || undefined}
              buttonLabel="选择开始日期"
              onChange={(value) => update("from", value ?? "")}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="transaction-to">结束日期</Label>
            <DatePickerInput
              id="transaction-to"
              value={draft.to || undefined}
              buttonLabel="选择结束日期"
              onChange={(value) => update("to", value ?? "")}
            />
          </div>
          <div className="flex items-end gap-2 lg:col-span-3">
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
        </div>
      </CollapsibleContent>
    </Collapsible>
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
    <div className="grid gap-1">
      <Label>{label}</Label>
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
    </div>
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
