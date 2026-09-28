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
        </li>
      ))}
    </ul>
  );
}
