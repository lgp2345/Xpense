import type { RentalBillDetail } from "@xpense/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBillAmount } from "./bill-format";
import { BillTable } from "./bill-table";
export function BillDetailSections({ bill }: { bill: RentalBillDetail }) {
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">生成时来源快照</h2>
        <p className="break-words">{bill.snapshot.propertyName}</p>
        <p>合同：{bill.snapshot.contractNumber}</p>
        <ul className="space-y-1 text-sm">
          {bill.snapshot.spaces.map((space) => (
            <li className="break-words" key={space.spaceId}>
              {space.spacePath.map((node) => node.name).join(" / ")} · 租金分配{" "}
              {space.rentAllocationMinor === null
                ? "未分配"
                : formatBillAmount(space.rentAllocationMinor, bill.currencyCode)}
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-sm">
          {bill.snapshot.parties.map((party) => (
            <li className="break-words" key={party.tenantId}>
              {party.name}
              {party.isPrimaryPayer ? " · 主付款人" : ""}
            </li>
          ))}
        </ul>
        <a
          className="inline-block text-sm underline"
          href={`/rentals/contracts/${encodeURIComponent(bill.contractId)}`}
        >
          查看当前合同
        </a>
      </section>
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">原计划与调整明细</h2>
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              {["项目", "覆盖期间", "参考分母", "金额"].map((text) => (
                <TableHead key={text}>{text}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bill.lines.map((line) => (
              <TableRow key={`${line.sortOrder}:${line.kind}`}>
                <TableCell className="max-w-48 whitespace-normal break-words">
                  {line.label}
                </TableCell>
                <TableCell>
                  {line.periodStart ? `${line.periodStart} 至 ${line.periodEnd}` : "—"}
                  {line.coveredDays !== null ? (
                    <p className="text-xs text-muted-foreground">覆盖 {line.coveredDays} 天</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {line.referenceDays !== null ? `${line.referenceDays} 天` : "—"}
                  {line.referenceStart ? (
                    <p className="text-xs text-muted-foreground">
                      {line.referenceStart} 至 {line.referenceEnd ?? "参考期超出展示年份"}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatBillAmount(line.amountMinor, bill.currencyCode)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-sm font-medium tabular-nums">
          最终应收 {formatBillAmount(bill.amountMinor, bill.currencyCode)}
        </p>
      </section>
      {bill.adjustment ? (
        <section className="space-y-2 rounded-lg border p-4 text-sm">
          <h2 className="font-semibold">终止金额确认</h2>
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
      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-semibold">同来源历史（最近 20 张）</h2>
        {bill.history.length ? (
          <BillTable
            items={bill.history}
            onNavigate={(id) => {
              window.location.href = `/rentals/bills/${encodeURIComponent(id)}`;
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">暂无其他历史账单。</p>
        )}
      </section>
    </div>
  );
}
