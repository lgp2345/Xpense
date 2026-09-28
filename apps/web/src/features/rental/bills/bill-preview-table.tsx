import type { RentalBillPreview } from "@xpense/shared";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BillCalculationLines } from "./bill-calculation-lines";
import { formatBillAmount as formatMoney } from "./bill-format";
export function BillPreviewTable({
  preview,
  onPageChange,
  disabled,
}: {
  preview: RentalBillPreview;
  onPageChange: (page: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>费用</TableHead>
              <TableHead>原付款账期</TableHead>
              <TableHead>到期日</TableHead>
              <TableHead>应收</TableHead>
              <TableHead>处理</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.items.map((item) => (
              <TableRow key={item.sourceKey}>
                <TableCell className="align-top">
                  {item.type === "rent"
                    ? "租金"
                    : (item.lines.find((line) => line.kind === "deposit")?.label ?? "押金")}
                  {item.lines.length ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        查看计算依据
                      </summary>
                      <BillCalculationLines lines={item.lines} />
                    </details>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {item.periodStart?.replaceAll("-", "/") ?? "—"}{" "}
                  {item.periodEnd ? `至 ${item.periodEnd.replaceAll("-", "/")}` : ""}
                </TableCell>
                <TableCell>{item.dueDate?.replaceAll("-", "/") ?? "待填写"}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(item.amountMinor)}</TableCell>
                <TableCell>
                  {item.disposition === "existing" ? "已存在，保持原值" : "将新增"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2 text-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || preview.page <= 1}
          onClick={() => onPageChange(preview.page - 1)}
        >
          上一页
        </Button>
        <span>
          第 {preview.page} 页，共 {Math.max(1, Math.ceil(preview.total / preview.pageSize))} 页
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || preview.page * preview.pageSize >= preview.total}
          onClick={() => onPageChange(preview.page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
