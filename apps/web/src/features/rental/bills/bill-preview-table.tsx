import type { RentalBillPreview } from "@xpense/shared";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrganizationCurrency } from "@/features/organizations/organization-currency";
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
  const currencyCode = useOrganizationCurrency();

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
                  {item.type === "period"
                    ? "账期账单"
                    : (item.lines.find((line) => line.kind === "deposit")?.label ?? "押金")}
                  {item.lines.length ? (
                    <Collapsible className="mt-2">
                      <CollapsibleTrigger
                        type="button"
                        className="group inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left text-xs text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className="size-3.5 transition-transform group-data-[panel-open]:rotate-90"
                        />
                        查看计算依据
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <BillCalculationLines
                          lines={item.lines}
                          currencyCode={item.currencyCode ?? currencyCode}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {item.periodStart ?? "—"} {item.periodEnd ? `至 ${item.periodEnd}` : ""}
                </TableCell>
                <TableCell>{item.dueDate ?? "待填写"}</TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(item.amountMinor, item.currencyCode ?? currencyCode)}
                </TableCell>
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
