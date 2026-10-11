import type { RentalMeterKind } from "@xpense/shared";
import { Input } from "@/components/ui/input";
import type { MeterCollection, PeriodBillDraft } from "./period-bill-form";

export function MeterReadingFields({
  readings,
  onChange,
  disabled = false,
  title = "本期抄表",
  prefix = "",
  errors,
  terms = { waterCollectionEnabled: true, electricityCollectionEnabled: true },
}: {
  readings: PeriodBillDraft["readings"];
  onChange: (kind: RentalMeterKind, field: "reading", value: string) => void;
  disabled?: boolean;
  title?: string;
  prefix?: string;
  terms?: MeterCollection;
  errors?: Readonly<Partial<Record<RentalMeterKind, Partial<Record<"reading", string>>>>>;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      {(["water", "electricity"] as const).map((kind) => {
        if (!terms[`${kind}CollectionEnabled`]) return null;
        const label = `${prefix}${kind === "water" ? "水表" : "电表"}`;
        const readingError = errors?.[kind]?.reading;
        return (
          <section className="space-y-2 rounded-md border p-3" key={kind}>
            <h3 className="text-sm font-medium">{label}</h3>
            <label className="block space-y-1 text-sm" htmlFor={`meter-reading-${prefix}-${kind}`}>
              <span>{label}读数</span>
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
          </section>
        );
      })}
    </fieldset>
  );
}
