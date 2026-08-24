import type { AccountSummary, LedgerSummary, TransactionRecord } from "@xpense/shared";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BookkeepingApi } from "../../../services/bookkeeping-api";

import {
  formatTransactionAmount,
  formatTransactionDate,
  transactionTypeLabel,
} from "./transaction-columns";
import { TransactionFormDialog } from "./transaction-form-dialog";

type TransactionTableProps = {
  api: BookkeepingApi;
  accounts: AccountSummary[];
  canDelete: boolean;
  canUpdate: boolean;
  deleting: boolean;
  items: TransactionRecord[];
  ledgers: LedgerSummary[];
  organizationId: string;
  onDelete: (transaction: TransactionRecord) => Promise<void>;
  onUpdate: (
    id: string,
    input: Parameters<
      NonNullable<React.ComponentProps<typeof TransactionFormDialog>["onUpdate"]>
    >[1],
  ) => Promise<void>;
};

/** 渲染紧凑桌面交易表格及非乐观行操作。 */
export function TransactionTable({
  api,
  accounts,
  canDelete,
  canUpdate,
  deleting,
  items,
  ledgers,
  organizationId,
  onDelete,
  onUpdate,
}: TransactionTableProps) {
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead>账户</TableHead>
              <TableHead>分类</TableHead>
              <TableHead className="text-right">金额</TableHead>
              {canUpdate || canDelete ? <TableHead className="text-right">操作</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const label = item.note ?? item.payee ?? item.categoryName ?? "交易";
              return (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatTransactionDate(item.occurredAt)}
                  </TableCell>
                  <TableCell>{transactionTypeLabel(item.type)}</TableCell>
                  <TableCell className="max-w-48 truncate" title={label}>
                    {label}
                  </TableCell>
                  <TableCell>
                    {item.destinationAccountName
                      ? `${item.accountName} → ${item.destinationAccountName}`
                      : item.accountName}
                  </TableCell>
                  <TableCell>{item.categoryName ?? "—"}</TableCell>
                  <TableCell
                    className={
                      item.type === "expense"
                        ? "text-right tabular-nums text-destructive"
                        : item.type === "income"
                          ? "text-right tabular-nums text-emerald-600"
                          : "text-right tabular-nums"
                    }
                  >
                    {formatTransactionAmount(item.amountMinor, item.type)}
                  </TableCell>
                  {canUpdate || canDelete ? (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {canUpdate ? (
                          <TransactionFormDialog
                            api={api}
                            accounts={accounts}
                            ledgers={ledgers}
                            organizationId={organizationId}
                            transaction={item}
                            onUpdate={onUpdate}
                          />
                        ) : null}
                        {canDelete ? (
                          <DeleteTransactionButton
                            disabled={deleting}
                            label={label}
                            transaction={item}
                            onDelete={onDelete}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** 删除交易前显示明确确认，并在服务端成功前保留原行。 */
function DeleteTransactionButton({
  disabled,
  label,
  onDelete,
  transaction,
}: {
  disabled: boolean;
  label: string;
  onDelete: (transaction: TransactionRecord) => Promise<void>;
  transaction: TransactionRecord;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button aria-label={`删除 ${label}`} disabled={disabled} size="sm" variant="destructive">
          删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除交易</AlertDialogTitle>
          <AlertDialogDescription>删除后账户余额和月度统计将重新计算。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onDelete(transaction)}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
