import type { RentalBillLine } from "@xpense/shared";
import { formatBillAmount } from "./bill-format";
/** 同时展示实际片段和完整参考区间，不将跨月片段伪装成自然月。 */
export function BillCalculationLines({
  lines,
  currencyCode,
}: {
  lines: RentalBillLine[];
  currencyCode?: string;
}) {
  return (
    <ul className="min-w-0 space-y-3 py-3 text-sm">
      {lines.map((line) => (
        <li
          key={`${line.sortOrder}:${line.kind}`}
          className="space-y-1 whitespace-normal break-words border-l-2 pl-3"
        >
          <p className="font-medium">
            {line.label} · {formatBillAmount(line.amountMinor, currencyCode)}
          </p>
          {line.periodStart ? (
            <p>
              {line.periodStart.replaceAll("-", "/")} 至 {line.periodEnd?.replaceAll("-", "/")}
            </p>
          ) : null}
          {line.referenceStart ? (
            <p className="text-xs text-muted-foreground">
              完整参考区间：{line.referenceStart.replaceAll("-", "/")} 至{" "}
              {line.referenceEnd?.replaceAll("-", "/") ?? "参考期超出展示年份"}
            </p>
          ) : null}
          {line.coveredDays !== null ? (
            <p className="text-xs text-muted-foreground">
              覆盖 {line.coveredDays} 天 · 参考 {line.referenceDays} 天 · 基础月租{" "}
              {formatBillAmount(line.baseRentAmountMinor ?? 0, currencyCode)}
            </p>
          ) : null}
          {line.feeSnapshot?.kind === "water" || line.feeSnapshot?.kind === "electricity" ? (
            <p className="text-xs text-muted-foreground">
              {line.feeSnapshot.kind === "water" ? "水表" : "电表"} {line.feeSnapshot.startReading}{" "}
              → {line.feeSnapshot.endReading} · 单价 {line.feeSnapshot.unitPrice}
              {line.feeSnapshot.overrideReason
                ? ` · 本期改价原因：${line.feeSnapshot.overrideReason}`
                : ""}
            </p>
          ) : null}
          {line.feeSnapshot?.kind === "fixed_fee" && line.feeSnapshot.overrideReason ? (
            <p className="text-xs text-muted-foreground">
              本期改价原因：{line.feeSnapshot.overrideReason}
            </p>
          ) : null}
          {line.feeSnapshot?.kind === "extra_fee" ? (
            <p className="text-xs text-muted-foreground">
              {line.feeSnapshot.origin === "settlement" ? "退租结算费用" : "月度额外费用"}
              {line.note ? ` · ${line.note}` : ""}
            </p>
          ) : line.note ? (
            <p className="text-xs text-muted-foreground">备注：{line.note}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
