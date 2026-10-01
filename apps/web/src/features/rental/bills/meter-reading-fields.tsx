import type { RentalMeterKind } from "@xpense/shared";
import { DatePickerInput } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import type { MonthlyBillDraft } from "./monthly-bill-form";

export function MeterReadingFields({
  readings,
  onChange,
  disabled = false,
  errors,
}: {
  readings: MonthlyBillDraft["readings"];
  onChange: (kind: RentalMeterKind, field: "readingDate" | "reading", value: string) => void;
  disabled?: boolean;
  errors?: Readonly<
    Partial<Record<RentalMeterKind, Partial<Record<"readingDate" | "reading", string>>>>
  >;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">本期抄表</legend>
      {(["water", "electricity"] as const).map((kind) => {
        const label = kind === "water" ? "水表" : "电表";
        const dateError = errors?.[kind]?.readingDate;
        const readingError = errors?.[kind]?.reading;
        return (
          <section className="space-y-2 rounded-md border p-3" key={kind}>
            <h3 className="text-sm font-medium">{label}</h3>
            <DatePickerInput
              aria-label={`${label}读数日期`}
              value={readings[kind].readingDate}
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? `meter-reading-${kind}-date-error` : undefined}
              onChange={(date) => onChange(kind, "readingDate", date ?? "")}
            />
            {dateError ? (
              <p id={`meter-reading-${kind}-date-error`} role="alert" className="text-destructive">
                {dateError}
              </p>
            ) : null}
            <label className="block space-y-1 text-sm" htmlFor={`meter-reading-${kind}`}>
              <span>{label}读数</span>
              <Input
                aria-label={`${label}读数`}
                id={`meter-reading-${kind}`}
                inputMode="decimal"
                value={readings[kind].reading}
                aria-invalid={Boolean(readingError)}
                aria-describedby={readingError ? `meter-reading-${kind}-error` : undefined}
                onChange={(event) => onChange(kind, "reading", event.target.value)}
              />
              {readingError ? (
                <p id={`meter-reading-${kind}-error`} role="alert" className="text-destructive">
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
