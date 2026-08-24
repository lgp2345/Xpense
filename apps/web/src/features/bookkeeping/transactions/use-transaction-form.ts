import { useForm } from "@tanstack/react-form";
import type {
  AccountSummary,
  CategoryNode,
  LedgerSummary,
  TransactionRecord,
  UpsertTransactionRequest,
} from "@xpense/shared";
import { toast } from "sonner";

import {
  createTransactionFormValues,
  isTransactionCategoryCompatible,
  toUpsertTransactionRequest,
  transactionFormSchema,
} from "./transaction-form-schema";

type UseTransactionFormOptions = {
  accounts: AccountSummary[];
  categoriesForLedger: (ledgerId: string) => CategoryNode[];
  ledgers: LedgerSummary[];
  transaction?: TransactionRecord;
  onCreate?: (input: UpsertTransactionRequest) => Promise<void>;
  onUpdate?: (id: string, input: UpsertTransactionRequest) => Promise<void>;
  onSaved: () => void;
  setSubmitError: (message: string | null) => void;
};

/** 创建保持字符串金额、分类边界和精确编辑值的交易表单实例。 */
export function useTransactionForm({
  accounts,
  categoriesForLedger,
  ledgers,
  onCreate,
  onSaved,
  onUpdate,
  setSubmitError,
  transaction,
}: UseTransactionFormOptions) {
  return useForm({
    defaultValues: createTransactionFormValues(transaction, {
      ledgerId: ledgers.find((item) => item.isDefault)?.id ?? ledgers[0]?.id,
      accountId: accounts[0]?.id,
    }),
    validators: { onChange: transactionFormSchema, onSubmit: transactionFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const parsed = transactionFormSchema.safeParse(value);
      if (!parsed.success) return;
      if (
        !isTransactionCategoryCompatible(parsed.data, categoriesForLedger(parsed.data.ledgerId))
      ) {
        setSubmitError("所选分类与当前账本或交易类型不匹配，请重新选择。");
        return;
      }
      try {
        const input = toUpsertTransactionRequest(parsed.data);
        if (transaction && onUpdate) await onUpdate(transaction.id, input);
        else if (onCreate) await onCreate(input);
        onSaved();
      } catch {
        toast.error("保存交易失败，请检查输入后重试。");
        setSubmitError("保存交易失败，请检查输入后重试。");
      }
    },
  });
}

export type TransactionFormApi = ReturnType<typeof useTransactionForm>;
