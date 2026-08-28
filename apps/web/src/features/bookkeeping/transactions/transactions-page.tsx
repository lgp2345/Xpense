import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { PermissionKey, TransactionRecord, UpsertTransactionRequest } from "@xpense/shared";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookkeepingApi, ListTransactionsQuery } from "../../../services/bookkeeping-api";
import {
  bookkeepingQueryOptions,
  invalidateTransactionMutation,
} from "../../../services/bookkeeping-query";
import { TransactionFilters } from "./transaction-filters";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransactionTable } from "./transaction-table";

export type TransactionsPageProps = {
  api: BookkeepingApi;
  organizationId: string;
  permissions: readonly PermissionKey[];
  search: ListTransactionsQuery;
  onSearchChange: (search: ListTransactionsQuery) => void;
};

/** 提供可筛选、分页与录入的交易工作台。 */
export function TransactionsPage({
  api,
  organizationId,
  onSearchChange,
  permissions,
  search,
}: TransactionsPageProps) {
  const queryClient = useQueryClient();
  const [ledgersQuery, accountsQuery] = useQueries({
    queries: [
      bookkeepingQueryOptions.personalLedgers(api, organizationId),
      bookkeepingQueryOptions.accounts(api, organizationId),
    ],
  });
  const ledgers = ledgersQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const categoryLedgerId =
    search.ledgerId ?? ledgers.find((item) => item.isDefault)?.id ?? ledgers[0]?.id ?? "";
  const categoriesQuery = useQuery({
    ...bookkeepingQueryOptions.categories(api, organizationId, {
      ledgerId: categoryLedgerId,
    }),
    enabled: categoryLedgerId.length > 0,
  });
  const transactionQuery = useQuery({
    ...bookkeepingQueryOptions.transactions(api, organizationId, search),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === organizationId ? keepPreviousData(previousData) : undefined,
  });
  const createMutation = useMutation({
    mutationFn: (input: UpsertTransactionRequest) => api.createTransaction(input),
    onSuccess: () => invalidateTransactionMutation(queryClient, organizationId),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertTransactionRequest }) =>
      api.updateTransaction(id, input),
    onSuccess: () => invalidateTransactionMutation(queryClient, organizationId),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => invalidateTransactionMutation(queryClient, organizationId),
  });
  const data = Array.isArray(transactionQuery.data)
    ? { items: [], total: 0, page: 1, pageSize: 20 }
    : transactionQuery.data;
  const categories = categoriesQuery.data ?? [];
  const canCreate = permissions.includes("transactions:create");
  const canUpdate = permissions.includes("transactions:update");
  const canDelete = permissions.includes("transactions:delete");
  const dependencyError = ledgersQuery.isError
    ? { label: "账本", retry: ledgersQuery.refetch }
    : accountsQuery.isError
      ? { label: "账户", retry: accountsQuery.refetch }
      : categoriesQuery.isError
        ? { label: "分类", retry: categoriesQuery.refetch }
        : null;
  const hasReadError = transactionQuery.isError || dependencyError !== null;
  const isReadPending =
    transactionQuery.isPending ||
    ledgersQuery.isPending ||
    accountsQuery.isPending ||
    (categoryLedgerId.length > 0 && categoriesQuery.isPending);

  /** 创建交易并在统一失效完成后反馈成功。 */
  async function handleCreate(input: UpsertTransactionRequest) {
    await createMutation.mutateAsync(input);
    toast.success("交易创建成功");
  }

  /** 更新交易并刷新相关财务查询。 */
  async function handleUpdate(id: string, input: UpsertTransactionRequest) {
    await updateMutation.mutateAsync({ id, input });
    toast.success("交易已更新");
  }

  /** 删除交易；失败时保留缓存中的原始行。 */
  async function handleDelete(transaction: TransactionRecord) {
    try {
      await deleteMutation.mutateAsync(transaction.id);
      toast.success("交易已删除");
    } catch {
      toast.error("删除交易失败，请稍后重试。");
    }
  }

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">交易记录</h1>
          <p className="text-sm text-muted-foreground">按账本、账户和分类查询真实流水</p>
        </div>
        {canCreate && ledgers.length > 0 && accounts.length > 0 ? (
          <TransactionFormDialog
            api={api}
            accounts={accounts}
            ledgers={ledgers}
            organizationId={organizationId}
            onCreate={handleCreate}
          />
        ) : null}
      </header>
      <TransactionFilters
        accounts={accounts}
        categories={categories}
        ledgers={ledgers}
        search={search}
        onApply={onSearchChange}
      />
      {dependencyError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>加载{dependencyError.label}失败，请重试。</span>
          <Button type="button" variant="outline" onClick={() => void dependencyError.retry()}>
            重试加载{dependencyError.label}
          </Button>
        </div>
      ) : null}
      {transactionQuery.isError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          加载交易失败，请稍后重试。
        </p>
      ) : null}
      {!hasReadError && isReadPending ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载交易...</span>
          </CardContent>
        </Card>
      ) : !hasReadError && data && data.items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">没有符合条件的交易。</p>
      ) : !hasReadError && data ? (
        <>
          <TransactionTable
            api={api}
            accounts={accounts}
            canDelete={canDelete}
            canUpdate={canUpdate}
            deleting={deleteMutation.isPending}
            items={data.items}
            ledgers={ledgers}
            organizationId={organizationId}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
          />
          <div className="flex items-center justify-end gap-3 text-sm">
            <span>
              第 {data.page} 页，共 {data.total} 笔
            </span>
            <Button
              variant="outline"
              disabled={data.page <= 1}
              onClick={() =>
                onSearchChange({ ...search, page: data.page - 1, pageSize: data.pageSize })
              }
            >
              上一页
            </Button>
            <Button
              variant="outline"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() =>
                onSearchChange({ ...search, page: data.page + 1, pageSize: data.pageSize })
              }
            >
              下一页
            </Button>
          </div>
        </>
      ) : null}
    </main>
  );
}
