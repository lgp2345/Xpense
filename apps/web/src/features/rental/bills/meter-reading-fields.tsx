import type { RentalMeterKind, RentalMeterReadingInput } from "@xpense/shared";
import { Input } from "@/components/ui/input";
import { useOrganizationCurrency } from "@/features/organizations/organization-currency";
import { formatBillAmount } from "./bill-format";
import type { MeterCollection, PeriodBillDraft } from "./period-bill-form";

export function MeterReadingFields({
  readings,
  onChange,
  disabled = false,
  title = "本期抄表",
  prefix = "",
  errors,
  billing,
  terms = { waterCollectionEnabled: true, electricityCollectionEnabled: true },
}: {
  readings: PeriodBillDraft["readings"];
  onChange: (kind: RentalMeterKind, field: "reading", value: string) => void;
  disabled?: boolean;
  title?: string;
  prefix?: string;
  terms?: MeterCollection;
  errors?: Readonly<Partial<Record<RentalMeterKind, Partial<Record<"reading", string>>>>>;
  billing?: {
    prices: Record<RentalMeterKind, string>;
    baselines: RentalMeterReadingInput[];
    amounts: Partial<Record<RentalMeterKind, number>>;
    busy: boolean;
    priceErrors: Partial<Record<RentalMeterKind, string | undefined>>;
    onPriceChange: (kind: RentalMeterKind, value: string) => void;
  };
}) {
  const currencyCode = useOrganizationCurrency();

  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">{billing ? "本期水电费" : title}</legend>
      {(["water", "electricity"] as const).map((kind) => {
        if (!terms[`${kind}CollectionEnabled`]) return null;
        const label = `${prefix}${kind === "water" ? "水表" : "电表"}`;
        const readingError = errors?.[kind]?.reading;
        const feeName = kind === "water" ? "水费" : "电费";
        const unit = kind === "water" ? "立方米" : "度";
        const priceId = `meter-price-${prefix}-${kind}`;
        return (
          <section className="space-y-3 rounded-md border p-3" key={kind}>
            <h3 className="text-sm font-medium">{label}</h3>
            {billing ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>上期{label}读数</span>
                  <span className="text-foreground tabular-nums">
                    {billing.baselines.find((reading) => reading.kind === kind)?.reading ||
                      "尚未登记"}
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <label htmlFor={priceId}>
                    本期{feeName}单价（{currencyCode}/{unit}）
                  </label>
                  <Input
                    id={priceId}
                    aria-label={`本期${feeName}单价`}
                    inputMode="decimal"
                    value={billing.prices[kind]}
                    aria-invalid={Boolean(billing.priceErrors[kind])}
                    aria-describedby={billing.priceErrors[kind] ? `${priceId}-error` : undefined}
                    onChange={(event) => billing.onPriceChange(kind, event.target.value)}
                  />
                  {billing.priceErrors[kind] ? (
                    <p id={`${priceId}-error`} role="alert" className="text-xs text-destructive">
                      {billing.priceErrors[kind]}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            <label className="block space-y-1 text-sm" htmlFor={`meter-reading-${prefix}-${kind}`}>
              <span>
                {label}读数{billing ? `（${unit}）` : ""}
              </span>
              <Input
                aria-label={`${label}读数`}
                id={`meter-reading-${prefix}-${kind}`}
                inputMode="decimal"
                value={readings[kind].reading}
                aria-invalid={Boolean(readingError)}
                aria-describedby={
                  readingError ? `meter-reading-${prefix}-${kind}-error` : undefined
                }
                onChange={(event) => onChange(kind, "reading", event.target.value)}
              />
              {readingError ? (
                <p
                  id={`meter-reading-${prefix}-${kind}-error`}
                  role="alert"
                  className="text-destructive"
                >
                  {readingError}
                </p>
              ) : null}
            </label>
            {billing ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                <span>本期{feeName}</span>
                <output aria-label={`本期${feeName}`} className="font-semibold tabular-nums">
                  {billing.busy
                    ? "正在计算…"
                    : billing.amounts[kind] !== undefined
                      ? `${formatBillAmount(billing.amounts[kind] ?? 0, currencyCode)}`
                      : readings[kind].reading
                        ? "等待有效预览"
                        : "请填写本期读数"}
                </output>
              </div>
            ) : null}
          </section>
        );
      })}
    </fieldset>
  );
}
