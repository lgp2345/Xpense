import { useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AccountSummary,
  CategoryNode,
  LedgerSummary,
  TransactionRecord,
  UpsertTransactionRequest,
} from "@xpense/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BookkeepingApi } from "../../../services/bookkeeping-api";
import { bookkeepingKeys, bookkeepingQueryOptions } from "../../../services/bookkeeping-query";

import { TransactionSelectField, transactionValidationMessage } from "./transaction-form-fields";
import type { TransactionFormValues } from "./transaction-form-schema";
import { type TransactionFormApi, useTransactionForm } from "./use-transaction-form";

type TransactionFormDialogProps = {
  api: BookkeepingApi;
  accounts: AccountSummary[];
  ledgers: LedgerSummary[];
  organizationId: string;
  transaction?: TransactionRecord;
  onCreate?: (input: UpsertTransactionRequest) => Promise<void>;
  onUpdate?: (id: string, input: UpsertTransactionRequest) => Promise<void>;
};

const typeOptions = [
  ["expense", "支出"],
  ["income", "收入"],
  ["transfer", "转账"],
] as const;

/** 创建或编辑交易的 TanStack Form + Zod 弹窗。 */
export function TransactionFormDialog(props: TransactionFormDialogProps) {
  const { accounts, api, ledgers, organizationId, transaction } = props;
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const form = useTransactionForm({
    ...props,
    categoriesForLedger: (ledgerId) =>
      queryClient.getQueryData<CategoryNode[]>(
        bookkeepingKeys.categories(organizationId, { ledgerId }),
      ) ?? [],
    onSaved: () => handleOpenChange(false),
    setSubmitError,
  });
  const categoryLedgerId = useStore(form.store, (state) => state.values.ledgerId);
  const transactionType = useStore(form.store, (state) => state.values.type);
  const categoriesQuery = useQuery({
    ...bookkeepingQueryOptions.categories(api, organizationId, {
      ledgerId: categoryLedgerId,
    }),
    enabled: open && transactionType !== "transfer" && categoryLedgerId.length > 0,
  });
  const categories = categoriesQuery.data ?? [];
  const isEditing = transaction !== undefined;

  /** 统一关闭弹窗并恢复交易草稿。 */
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSubmitError(null);
      form.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          aria-label={
            isEditing ? `编辑 ${transaction.note ?? transaction.payee ?? "交易"}` : undefined
          }
          size={isEditing ? "sm" : "default"}
          variant={isEditing ? "outline" : "default"}
        >
          {isEditing ? "编辑" : "新增交易"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑交易" : "新增交易"}</DialogTitle>
          <DialogDescription>金额按最小货币单位精确保存。</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="type">
            {(field) => (
              <TransactionSelectField
                label="交易类型"
                value={field.state.value}
                options={typeOptions}
                onChange={(value) => {
                  const type = value as TransactionFormValues["type"];
                  field.handleChange(type);
                  form.setFieldValue("categoryId", "");
                }}
              />
            )}
          </form.Field>
          <form.Field name="ledgerId">
            {(field) => (
              <TransactionSelectField
                label="账本"
                value={field.state.value}
                options={ledgers.map((item) => [item.id, item.name] as const)}
                onChange={(ledgerId) => {
                  field.handleChange(ledgerId);
                  form.setFieldValue("categoryId", "");
                }}
                error={transactionValidationMessage(field.state.meta.errors[0])}
              />
            )}
          </form.Field>
          <form.Field name="accountId">
            {(field) => (
              <TransactionSelectField
                label="账户"
                value={field.state.value}
                options={accounts.map((item) => [item.id, item.name] as const)}
                onChange={field.handleChange}
                error={transactionValidationMessage(field.state.meta.errors[0])}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.type}>
            {(type) =>
              type === "transfer" ? (
                <form.Field name="destinationAccountId">
                  {(field) => (
                    <TransactionSelectField
                      label="目标账户"
                      value={field.state.value}
                      options={accounts.map((item) => [item.id, item.name] as const)}
                      onChange={field.handleChange}
                      error={transactionValidationMessage(field.state.meta.errors[0])}
                    />
                  )}
                </form.Field>
              ) : (
                <form.Field name="categoryId">
                  {(field) => (
                    <TransactionSelectField
                      label="分类"
                      value={field.state.value}
                      options={flattenCategories(categories)
                        .filter((item) => item.type === type)
                        .map((item) => [item.id, item.name] as const)}
                      onChange={field.handleChange}
                      error={transactionValidationMessage(field.state.meta.errors[0])}
                    />
                  )}
                </form.Field>
              )
            }
          </form.Subscribe>
          {transactionType !== "transfer" && categoriesQuery.isPending ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              正在加载分类...
            </p>
          ) : null}
          {transactionType !== "transfer" && categoriesQuery.isError ? (
            <div className="flex items-center justify-between gap-3" role="alert">
              <span className="text-sm text-destructive">加载分类失败，请重试。</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void categoriesQuery.refetch()}
              >
                重试加载分类
              </Button>
            </div>
          ) : null}
          <TextField form={form} label="金额" name="amount" inputMode="decimal" />
          <TextField form={form} label="发生时间" name="occurredAt" type="datetime-local" />
          <TextField form={form} label="收付款方" name="payee" />
          <TextField form={form} label="备注" name="note" />
          {submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  disabled={
                    isSubmitting ||
                    (transactionType !== "transfer" &&
                      (categoriesQuery.isPending || categoriesQuery.isError))
                  }
                  type="submit"
                >
                  {isSubmitting ? "正在保存..." : isEditing ? "保存交易" : "创建交易"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 渲染交易表单的普通字符串输入。 */
function TextField({
  form,
  inputMode,
  label,
  name,
  type = "text",
}: {
  form: TransactionFormApi;
  inputMode?: "decimal";
  label: string;
  name: "amount" | "occurredAt" | "payee" | "note";
  type?: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => {
        const error = transactionValidationMessage(field.state.meta.errors[0]);
        return (
          <div className="grid gap-2">
            <Label htmlFor={field.name}>{label}</Label>
            <Input
              id={field.name}
              inputMode={inputMode}
              type={type}
              value={field.state.value}
              aria-invalid={Boolean(error)}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        );
      }}
    </form.Field>
  );
}

/** 展平两级分类供交易表单选择。 */
function flattenCategories(categories: CategoryNode[]): CategoryNode[] {
  return categories.flatMap((category) => [category, ...category.children]);
}
