import type { RentalPeriodBillContext, RentalPeriodBillPreview } from "@xpense/shared";
import { useId } from "react";
import { DatePickerInput } from "@/components/date-picker";
import { BillingPeriodSelect } from "./billing-period-select";
import { MeterReadingFields } from "./meter-reading-fields";
import type { PeriodBillDraft } from "./period-bill-form";
import { PeriodChargeFields } from "./period-charge-fields";

type Props = {
  draft: PeriodBillDraft;
  context: RentalPeriodBillContext;
  preview: RentalPeriodBillPreview | null;
  previewBusy: boolean;
  errors: ReadonlyMap<string, string>;
  disabled: boolean;
  onChange: <K extends keyof PeriodBillDraft>(key: K, value: PeriodBillDraft[K]) => void;
};
/** 账期和水电费用由服务端提供，收费事项直接录入本期金额。 */
export function PeriodBillFields({
  draft,
  context,
  preview,
  previewBusy,
  errors,
  disabled,
  onChange,
}: Props) {
  const continuation =
    context.canSelectBillingStart && draft.periodStart !== context.nextPeriod?.periodStart;
  const fieldId = useId();
  const meterErrors = (name: "readings" | "baselineReadings") =>
    Object.fromEntries(
      (["water", "electricity"] as const).map((kind) => [
        kind,
        {
          reading: errors.get(`${name}.${kind}.reading`),
        },
      ]),
    );
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <label htmlFor="period-start">出账账期</label>
          {context.canSelectBillingStart ? (
            <BillingPeriodSelect
              periods={context.selectablePeriods}
              value={draft.periodStart}
              disabled={disabled}
              onChange={(value) => onChange("periodStart", value)}
            />
          ) : (
            <p className="rounded-md border px-3 py-2 tabular-nums">
              {context.nextPeriod?.periodStart} 至 {context.nextPeriod?.periodEnd}
            </p>
          )}
        </div>
        <div className="space-y-1 text-sm">
          <label htmlFor="period-due-date">付款截止日</label>
          <DatePickerInput
            id="period-due-date"
            aria-label="付款截止日"
            value={draft.dueDate}
            onChange={(date) => onChange("dueDate", date ?? "")}
            aria-invalid={Boolean(errors.get("dueDate"))}
          />
          {errors.get("dueDate") ? (
            <p role="alert" className="text-destructive">
              {errors.get("dueDate")}
            </p>
          ) : null}
        </div>
      </div>
      {continuation ? (
        <section className="space-y-3 rounded-md border border-warning/30 p-3">
          <p className="text-sm">
            接续账期之前的房租、固定费及水电视为已在线下结清，不补收历史费用。
          </p>
          <MeterReadingFields
            title="接续起算读数"
            prefix="起算"
            terms={context.defaults}
            readings={draft.baselineReadings}
            errors={meterErrors("baselineReadings")}
            onChange={(kind, field, value) =>
              onChange("baselineReadings", {
                ...draft.baselineReadings,
                [kind]: { ...draft.baselineReadings[kind], [field]: value },
              })
            }
          />
        </section>
      ) : null}
      <PeriodChargeFields
        draft={draft}
        terms={context.defaults}
        errors={errors}
        onChange={onChange}
      />
      <MeterReadingFields
        terms={context.defaults}
        billing={{
          prices: {
            water: draft.overrideWaterUnitPrice,
            electricity: draft.overrideElectricityUnitPrice,
          },
          baselines: continuation
            ? (["water", "electricity"] as const).map((kind) => ({
                kind,
                reading: draft.baselineReadings[kind].reading,
              }))
            : context.baselineReadings,
          amounts: Object.fromEntries(
            preview?.lines
              .filter((line) => line.kind === "water" || line.kind === "electricity")
              .map((line) => [line.kind, line.amountMinor]) ?? [],
          ),
          busy: previewBusy,
          priceErrors: {
            water: errors.get("overrideWaterUnitPrice"),
            electricity: errors.get("overrideElectricityUnitPrice"),
          },
          onPriceChange: (kind, value) =>
            onChange(
              kind === "water" ? "overrideWaterUnitPrice" : "overrideElectricityUnitPrice",
              value,
            ),
        }}
        readings={draft.readings}
        errors={meterErrors("readings")}
        onChange={(kind, field, value) =>
          onChange("readings", {
            ...draft.readings,
            [kind]: { ...draft.readings[kind], [field]: value },
          })
        }
      />
      <div className="space-y-2 border-t pt-4 text-sm">
        <label htmlFor={`${fieldId}-note`} className="font-medium">
          备注
        </label>
        <textarea
          id={`${fieldId}-note`}
          aria-label="备注"
          rows={3}
          maxLength={1000}
          className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:text-sm"
          value={draft.overrideReason}
          aria-invalid={Boolean(errors.get("overrideReason"))}
          aria-describedby={`${fieldId}-note-help${errors.get("overrideReason") ? ` ${fieldId}-note-error` : ""}`}
          onChange={(event) => onChange("overrideReason", event.target.value)}
        />
        <p id={`${fieldId}-note-help`} className="text-xs text-muted-foreground">
          如调整本期金额或单价，请说明原因；其他情况可留空。
        </p>
        {errors.get("overrideReason") ? (
          <p id={`${fieldId}-note-error`} role="alert" className="text-xs text-destructive">
            {errors.get("overrideReason")}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
