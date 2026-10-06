import type { RentalBillDetail } from "@xpense/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBillAmount } from "./bill-format";
export function BillDetailSections({ bill }: { bill: RentalBillDetail }) {
  const showMeasurement = bill.lines.some(
    (line) =>
      line.periodStart ||
      line.feeSnapshot?.kind === "water" ||
      line.feeSnapshot?.kind === "electricity",
  );
  const showReference = bill.lines.some((line) => line.referenceDays !== null);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base leading-6">
            <h2>费用明细</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Table className={showMeasurement || showReference ? "min-w-[640px]" : "w-full"}>
            <TableHeader>
              <TableRow>
                {[
                  "项目",
                  ...(showMeasurement ? ["实际计量与覆盖期间"] : []),
                  ...(showReference ? ["参考分母"] : []),
                  "金额",
                ].map((text) => (
                  <TableHead key={text} className={text === "金额" ? "text-right" : undefined}>
                    {text}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bill.lines.map((line) => (
                <TableRow key={`${line.sortOrder}:${line.kind}`}>
                  <TableCell className="max-w-48 whitespace-normal break-words">
                    <p>{line.label}</p>
                    {line.feeSnapshot?.kind === "extra_fee" ? (
                      <p className="text-xs text-muted-foreground">
                        {line.feeSnapshot.origin === "settlement" ? "退租结算费用" : "月度额外费用"}
                      </p>
                    ) : null}
                    {line.note ? (
                      <p className="text-xs text-muted-foreground">备注：{line.note}</p>
                    ) : null}
                  </TableCell>
                  {showMeasurement ? (
                    <TableCell>
                      {line.periodStart ? `${line.periodStart} 至 ${line.periodEnd}` : "不适用"}
                      {line.coveredDays !== null ? (
                        <p className="text-xs text-muted-foreground">覆盖 {line.coveredDays} 天</p>
                      ) : null}
                      {line.feeSnapshot?.kind === "water" ||
                      line.feeSnapshot?.kind === "electricity" ? (
                        <div className="text-xs text-muted-foreground">
                          <p>
                            {line.feeSnapshot.kind === "water" ? "水表" : "电表"}{" "}
                            {line.feeSnapshot.startReading} → {line.feeSnapshot.endReading}
                          </p>
                          <p>
                            读数区间：{line.feeSnapshot.startDate} 至 {line.feeSnapshot.endDate} ·
                            单价 {line.feeSnapshot.unitPrice}
                          </p>
                          {line.feeSnapshot.overrideReason ? (
                            <p>本期改价原因：{line.feeSnapshot.overrideReason}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {line.feeSnapshot?.kind === "fixed_fee" && line.feeSnapshot.overrideReason ? (
                        <p className="text-xs text-muted-foreground">
                          本期改价原因：{line.feeSnapshot.overrideReason}
                        </p>
                      ) : null}
                    </TableCell>
                  ) : null}
                  {showReference ? (
                    <TableCell>
                      {line.referenceDays !== null ? `${line.referenceDays} 天` : "不适用"}
                      {line.referenceStart ? (
                        <p className="text-xs text-muted-foreground">
                          {line.referenceStart} 至 {line.referenceEnd ?? "参考期超出展示年份"}
                        </p>
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right tabular-nums">
                    {formatBillAmount(line.amountMinor, bill.currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t pt-3 text-right text-sm font-medium tabular-nums">
            最终应收 {formatBillAmount(bill.amountMinor, bill.currencyCode)}
          </p>
        </CardContent>
      </Card>
      {bill.adjustment ? (
        <section className="space-y-2 rounded-lg border p-4 text-sm">
          <h2 className="text-sm font-semibold">终止金额确认</h2>
          <p>
            原始 {formatBillAmount(bill.adjustment.originalAmountMinor, bill.currencyCode)} ·
            截至终止日参考{" "}
            {formatBillAmount(bill.adjustment.referenceAmountMinor, bill.currencyCode)}
          </p>
          <p>整期最终 {formatBillAmount(bill.adjustment.finalAmountMinor, bill.currencyCode)}</p>
          <p className="break-words">确认原因：{bill.adjustment.reason}</p>
          <p>
            终止日：{bill.adjustment.terminationDate}
            {bill.adjustment.revokedAt ? " · 已撤销" : ""}
          </p>
        </section>
      ) : null}
      {bill.voidReason ? (
        <p className="break-words rounded-lg border p-4 text-sm">
          作废原因：{bill.voidReason}
          {bill.voidedAt ? ` · ${bill.voidedAt}` : ""}
        </p>
      ) : null}
    </div>
  );
}
