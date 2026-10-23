import type { RentalPeriodBillPreview } from "@xpense/shared";
import {
  formatDecimalMoney,
  useOrganizationCurrency,
} from "@/features/organizations/organization-currency";
import { formatBillAmount, formatDailyRent } from "./bill-format";
import { periodMissingFieldLabel } from "./period-bill-form";

/** 展示服务端计算的明细与总额，缺项时引导补齐表单。 */
export function PeriodBillPreview({ preview }: { preview: RentalPeriodBillPreview }) {
  const currencyCode = useOrganizationCurrency();

  return (
    <section aria-label="服务端账单预览" className="border rounded-md space-y-2 p-3">
      <h3 className="font-medium text-sm">
        账单预览 · {preview.period.periodStart} 至 {preview.period.periodEnd}
      </h3>
      <ul className="divide-y text-sm">
        {preview.lines.map((line) => {
          const { coveredDays, referenceDays, baseRentAmountMinor } = line;
          const prorated =
            line.kind === "rent_period" &&
            coveredDays !== null &&
            referenceDays !== null &&
            referenceDays > 0 &&
            coveredDays < referenceDays &&
            baseRentAmountMinor !== null;
          return (
            <li
              key={`${line.sortOrder}:${line.kind}`}
              className={
                prorated
                  ? "grid min-w-0 gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
                  : "flex flex-wrap justify-between gap-2 py-2"
              }
            >
              <span>
                {line.label}
                {prorated
                  ? `（完整账期租金 ${formatBillAmount(baseRentAmountMinor, currencyCode)}）`
                  : ""}
                {line.note ? ` · ${line.note}` : ""}
              </span>
              <span className="text-right tabular-nums">
                {prorated
                  ? `${formatDecimalMoney(formatDailyRent(baseRentAmountMinor, referenceDays), currencyCode)}/天 × ${coveredDays} 天 = ${formatBillAmount(line.amountMinor, currencyCode)}`
                  : formatBillAmount(line.amountMinor, currencyCode)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="font-semibold text-right tabular-nums">
        应收 {formatBillAmount(preview.amountMinor, currencyCode)}
      </p>
      {preview.missingFields.length ? (
        <p role="alert" className="text-sm text-destructive">
          尚缺：{preview.missingFields.map(periodMissingFieldLabel).join("、")}
        </p>
      ) : null}
    </section>
  );
}
