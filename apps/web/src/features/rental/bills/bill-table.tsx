import type { RentalBillDueState, RentalBillSummary } from "@xpense/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { billFinancialLabel } from "./bill-cash-model";
import { formatBillAmount } from "./bill-format";
export function billDueLabel(state: RentalBillDueState | null) {
  return state === "date_passed"
    ? "到期日已过"
    : state === "due_today"
      ? "今日到期"
      : state === "upcoming"
        ? "尚未到期"
        : "—";
}
export function BillTable({
  items,
  onNavigate,
  selection,
}: {
  items: RentalBillSummary[];
  onNavigate?: (id: string) => void;
  selection?: {
    ids: readonly string[];
    selectableIds: readonly string[];
    onChange: (ids: string[]) => void;
  };
}) {
  const checkedCount =
    selection?.selectableIds.filter((id) => selection.ids.includes(id)).length ?? 0;
  return (
    <Table className="min-w-[800px]">
      <TableHeader>
        <TableRow>
          {selection ? (
            <TableHead className="w-10">
              <Checkbox
                aria-label="选择当前页可登记账单"
                disabled={selection.selectableIds.length === 0}
                checked={
                  checkedCount === 0
                    ? false
                    : checkedCount === selection.selectableIds.length
                      ? true
                      : "indeterminate"
                }
                onCheckedChange={(checked) =>
                  selection.onChange(checked === true ? [...selection.selectableIds] : [])
                }
              />
            </TableHead>
          ) : null}
          {["账单/合同", "收退款", "房产与费用", "到期日", "应收金额", "费用所属期间"].map((label) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((bill) => (
          <TableRow
            key={bill.id}
            data-state={selection?.ids.includes(bill.id) ? "selected" : undefined}
          >
            {selection ? (
              <TableCell className="align-top pt-4">
                <Checkbox
                  aria-label={`选择账单 ${bill.billNumber}`}
                  disabled={!selection.selectableIds.includes(bill.id)}
                  checked={selection.ids.includes(bill.id)}
                  onCheckedChange={(checked) =>
                    selection.onChange(
                      checked === true
                        ? [...selection.ids, bill.id]
                        : selection.ids.filter((id) => id !== bill.id),
                    )
                  }
                />
              </TableCell>
            ) : null}
            <TableCell className="min-w-48 align-top">
              {onNavigate ? (
                <Button variant="link" className="h-auto p-0" onClick={() => onNavigate(bill.id)}>
                  {bill.billNumber}
                </Button>
              ) : (
                <span>{bill.billNumber}</span>
              )}
              <p className="text-xs text-muted-foreground">{bill.contractNumber}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant={bill.financial?.state === "settled" ? "secondary" : "outline"}>
                  {billFinancialLabel(bill)}
                </Badge>
                {bill.status === "voided" ? (
                  <Badge variant="outline">作废</Badge>
                ) : (
                  <span className="sr-only">有效</span>
                )}
              </div>
              {bill.settlementId ? (
                <p className="mt-1 text-xs text-muted-foreground">收退由合同结算处理</p>
              ) : null}
            </TableCell>
            <TableCell className="align-top text-xs tabular-nums">
              {bill.modelVersion === 2 && bill.financial ? (
                <div className="space-y-1">
                  <p className="font-medium">
                    已收 {formatBillAmount(bill.financial.receivedMinor, bill.currencyCode)}
                  </p>
                  {!bill.settlementId ? (
                    <p className="text-muted-foreground">
                      待收 {formatBillAmount(bill.financial.outstandingMinor, bill.currencyCode)}
                    </p>
                  ) : null}
                  {bill.financial.refundedMinor > 0 ? (
                    <p className="text-muted-foreground">
                      已退 {formatBillAmount(bill.financial.refundedMinor, bill.currencyCode)}
                    </p>
                  ) : null}
                  {!bill.settlementId && bill.financial.refundableMinor > 0 ? (
                    <p className="font-medium">
                      可退 {formatBillAmount(bill.financial.refundableMinor, bill.currencyCode)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <span className="text-muted-foreground">无余额信息</span>
              )}
            </TableCell>
            <TableCell className="max-w-48 whitespace-normal break-words">
              {bill.propertyName}
              <p className="mt-1 text-xs text-muted-foreground">
                {bill.type === "rent" ? "租金" : bill.type === "deposit" ? "押金" : "月度综合账单"}
              </p>
            </TableCell>
            <TableCell>
              {bill.dueDate}
              {bill.dueState ? (
                <p className="text-xs text-muted-foreground">{billDueLabel(bill.dueState)}</p>
              ) : null}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatBillAmount(bill.amountMinor, bill.currencyCode)}
            </TableCell>
            <TableCell>
              {bill.periodStart ? `${bill.periodStart} 至 ${bill.periodEnd}` : "不适用"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
