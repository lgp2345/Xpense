import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountSummary, PermissionKey } from "@xpense/shared";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  BookkeepingApi,
  CreateAccountRequest,
  UpdateAccountRequest,
} from "../../../services/bookkeeping-api";
import {
  bookkeepingQueryOptions,
  invalidateAccountMutation,
} from "../../../services/bookkeeping-query";
import { webBookkeepingApi } from "../../../services/web-session";
import { AccountFormDialog } from "./account-form-dialog";

type AccountsPageProps = {
  api?: Pick<BookkeepingApi, "listAccounts" | "createAccount" | "updateAccount" | "deleteAccount">;
  organizationId: string;
  permissions: readonly PermissionKey[];
};

const accountTypeLabels: Record<AccountSummary["type"], string> = {
  cash: "现金",
  bank: "银行卡",
  e_wallet: "电子钱包",
  credit_card: "信用卡",
  other: "其他",
};

/** 账户管理页面；余额始终由服务端流水聚合结果展示。 */
export function AccountsPage({
  api = webBookkeepingApi,
  organizationId,
  permissions,
}: AccountsPageProps) {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery(
    bookkeepingQueryOptions.accounts(api as BookkeepingApi, organizationId),
  );
  const [lastSuccessfulMutation, setLastSuccessfulMutation] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (input: CreateAccountRequest) => api.createAccount(input),
    onSuccess: () => invalidateAccountMutation(queryClient, organizationId),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAccountRequest }) =>
      api.updateAccount(id, input),
    onSuccess: () => invalidateAccountMutation(queryClient, organizationId),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => invalidateAccountMutation(queryClient, organizationId),
  });
  const accounts = accountsQuery.data ?? [];

  async function handleCreate(input: CreateAccountRequest) {
    await createMutation.mutateAsync(input);
    toast.success("账户创建成功");
    setLastSuccessfulMutation("账户已创建");
  }

  async function handleUpdate(id: string, input: UpdateAccountRequest) {
    await updateMutation.mutateAsync({ id, input });
    toast.success("账户已更新");
    setLastSuccessfulMutation("账户已更新");
  }

  async function handleDelete(account: AccountSummary) {
    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync(account.id);
      toast.success("账户已删除");
    } catch {
      toast.error("删除账户失败，请确认账户没有被有效交易引用。");
      setErrorMessage("删除账户失败，请确认账户没有被有效交易引用。");
      return;
    }
    setLastSuccessfulMutation("账户已删除");
  }

  const queryErrorMessage = accountsQuery.isError
    ? accountsQuery.data && lastSuccessfulMutation
      ? `${lastSuccessfulMutation}，但刷新列表失败，请重试。`
      : "加载账户失败，请稍后重试。"
    : null;

  const canCreate = permissions.includes("accounts:create");
  const canUpdate = permissions.includes("accounts:update");
  const canDelete = permissions.includes("accounts:delete");

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">账户管理</h1>
          <p className="text-sm text-muted-foreground">余额由有效交易流水实时汇总</p>
        </div>
        {canCreate ? <AccountFormDialog onCreate={handleCreate} /> : null}
      </header>
      {(errorMessage ?? queryErrorMessage) ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {errorMessage ?? queryErrorMessage}
        </div>
      ) : null}
      {accountsQuery.isPending ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载账户...</span>
          </CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">当前没有账户。</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账户</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="text-right">余额</TableHead>
                  {canUpdate || canDelete ? (
                    <TableHead className="text-right">操作</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{accountTypeLabels[item.type]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCny(item.balanceMinor)}
                    </TableCell>
                    {canUpdate || canDelete ? (
                      <TableCell className="flex justify-end gap-2">
                        {canUpdate ? (
                          <AccountFormDialog account={item} onUpdate={handleUpdate} />
                        ) : null}
                        {canDelete ? (
                          <DeleteAccountButton
                            account={item}
                            disabled={deleteMutation.isPending}
                            onDelete={handleDelete}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

/** 删除账户前要求显式确认。 */
function DeleteAccountButton({
  account,
  disabled,
  onDelete,
}: {
  account: AccountSummary;
  disabled: boolean;
  onDelete: (account: AccountSummary) => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`删除 ${account.name}`}
          disabled={disabled}
          size="sm"
          variant="destructive"
        >
          删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除账户</AlertDialogTitle>
          <AlertDialogDescription>
            删除后普通接口不再显示该账户，历史交易仍保留名称。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onDelete(account)}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 使用整数拆分格式化人民币，避免安全整数边界在除法时丢失分位。 */
function formatCny(amountMinor: number): string {
  const minor = BigInt(amountMinor);
  const isNegative = minor < 0n;
  const absolute = isNegative ? -minor : minor;
  const yuan = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}¥${yuan}.${cents}`;
}
