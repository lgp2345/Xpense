import type { RentalBillDueState, RentalBillSummary } from "@xpense/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
}: {
  items: RentalBillSummary[];
  onNavigate?: (id: string) => void;
}) {
  return (
    <Table className="min-w-[680px]">
      <TableHeader>
        <TableRow>
          {["账单/合同", "房产", "费用", "付款账期", "到期日", "金额", "状态"].map((label) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((bill) => (
          <TableRow key={bill.id}>
            <TableCell>
              {onNavigate ? (
                <Button variant="link" className="h-auto p-0" onClick={() => onNavigate(bill.id)}>
                  {bill.billNumber}
                </Button>
              ) : (
                <span>{bill.billNumber}</span>
              )}
              <p className="text-xs text-muted-foreground">{bill.contractNumber}</p>
            </TableCell>
            <TableCell className="max-w-48 whitespace-normal break-words">
              {bill.propertyName}
            </TableCell>
            <TableCell>{bill.type === "rent" ? "租金" : "押金"}</TableCell>
            <TableCell>
              {bill.periodStart ? `${bill.periodStart} 至 ${bill.periodEnd}` : "—"}
            </TableCell>
            <TableCell>
              {bill.dueDate}
              <p className="text-xs text-muted-foreground">{billDueLabel(bill.dueState)}</p>
            </TableCell>
            <TableCell className="tabular-nums">
              {formatBillAmount(bill.amountMinor, bill.currencyCode)}
            </TableCell>
            <TableCell>
              <Badge variant={bill.status === "active" ? "secondary" : "outline"}>
                {bill.status === "active" ? "有效" : "作废"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
