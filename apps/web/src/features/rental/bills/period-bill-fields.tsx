import type { RentalPeriodBillContext } from "@xpense/shared";
import { useId } from "react";
import { DatePickerInput } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBillAmount } from "./bill-format";
import { ExtraFeeFields } from "./extra-fee-fields";
import { MeterReadingFields } from "./meter-reading-fields";
import type { PeriodBillDraft } from "./period-bill-form";

type Props = {
  draft: PeriodBillDraft;
  context: RentalPeriodBillContext;
  errors: ReadonlyMap<string, string>;
  disabled: boolean;
  page: number;
  onPage: (page: number) => void;
  onChange: <K extends keyof PeriodBillDraft>(key: K, value: PeriodBillDraft[K]) => void;
};
/** 完整输入区域：账期来自服务端候选列表，读数与覆盖价格均只录入、不计算金额。 */
export function PeriodBillFields({
  draft,
  context,
  errors,
  disabled,
  page,
  onPage,
  onChange,
}: Props) {
  const continuation =
    context.canSelectBillingStart && draft.periodStart !== context.nextPeriod?.periodStart;
  const feeErrors = new Map(
    draft.extraFees.map((fee, index) => [
      fee.id,
      {
        name: errors.get(`extraFees.${index}.name`),
        amount: errors.get(`extraFees.${index}.amount`),
        note: errors.get(`extraFees.${index}.note`),
      },
    ]),
  );
  const fieldId = useId();
  const meterErrors = (name: "readings" | "baselineReadings") =>
    Object.fromEntries(
      (["water", "electricity"] as const).map((kind) => [
        kind,
        {
          readingDate: errors.get(`${name}.${kind}.readingDate`),
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
            <select
              id="period-start"
              aria-label="出账账期"
              className="h-10 w-full rounded-md border bg-background px-3 text-base focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              value={draft.periodStart}
              onChange={(event) => onChange("periodStart", event.target.value)}
            >
              <option value={draft.periodStart}>
                {draft.periodStart}
                {draft.periodStart === context.nextPeriod?.periodStart
                  ? ` 至 ${context.nextPeriod.periodEnd}`
                  : "（已选择）"}
              </option>
              {context.selectablePeriods.items
                .filter((period) => period.periodStart !== draft.periodStart)
                .map((period) => (
                  <option key={period.periodStart} value={period.periodStart}>
                    {period.periodStart} 至 {period.periodEnd}
                  </option>
                ))}
            </select>
          ) : (
            <p className="rounded-md border px-3 py-2 tabular-nums">
              {context.nextPeriod?.periodStart} 至 {context.nextPeriod?.periodEnd}
            </p>
          )}
          {context.canSelectBillingStart &&
          context.selectablePeriods.total > context.selectablePeriods.pageSize ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => onPage(page - 1)}
              >
                上一页账期
              </Button>
              <span>第 {page} 页</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  page * context.selectablePeriods.pageSize >= context.selectablePeriods.total
                }
                onClick={() => onPage(page + 1)}
              >
                下一页账期
              </Button>
            </div>
          ) : null}
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
      <section className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
        <h3 className="font-medium">本期收费依据</h3>
        {(["water", "electricity"] as const).map((kind) => (
          <p key={kind}>
            {kind === "water" ? "水费" : "电费"}：
            {context.defaults[`${kind}CollectionEnabled`]
              ? `${context.defaults[`${kind}UnitPrice`]} 元/单位`
              : "不代收"}
          </p>
        ))}
        {context.defaults.fixedFees.map((fee) => (
          <p key={fee.id}>
            {fee.name} {formatBillAmount(fee.periodAmountMinor)} 元/期
          </p>
        ))}
        {context.baselineReadings.map((reading) => (
          <p key={reading.kind}>
            上期{reading.kind === "water" ? "水表" : "电表"}读数 {reading.reading} ·{" "}
            {reading.readingDate}
          </p>
        ))}
      </section>
      <MeterReadingFields
        terms={context.defaults}
        readings={draft.readings}
        errors={meterErrors("readings")}
        onChange={(kind, field, value) =>
          onChange("readings", {
            ...draft.readings,
            [kind]: { ...draft.readings[kind], [field]: value },
          })
        }
      />
      <details className="space-y-3 rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">调整本期收费（可选）</summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-2">
          {(["water", "electricity"] as const)
            .filter((kind) => context.defaults[`${kind}CollectionEnabled`])
            .map((kind) => {
              const key =
                kind === "water" ? "overrideWaterUnitPrice" : "overrideElectricityUnitPrice";
              return (
                <label key={kind} htmlFor={`${fieldId}-${kind}`} className="space-y-1 text-sm">
                  <span>本期{kind === "water" ? "水费" : "电费"}单价（元）</span>
                  <Input
                    id={`${fieldId}-${kind}`}
                    aria-label={`本期${kind === "water" ? "水费" : "电费"}单价`}
                    placeholder="沿用合同单价"
                    inputMode="decimal"
                    value={draft[key]}
                    onChange={(event) => onChange(key, event.target.value)}
                  />
                  {errors.get(key) ? (
                    <p role="alert" className="text-destructive">
                      {errors.get(key)}
                    </p>
                  ) : null}
                </label>
              );
            })}
          {draft.overrideFixedFees.map((fee, index) => (
            <label key={fee.id} htmlFor={`${fieldId}-${fee.id}`} className="space-y-1 text-sm">
              <span>
                本期{context.defaults.fixedFees.find((item) => item.id === fee.id)?.name}（元/期）
              </span>
              <Input
                id={`${fieldId}-${fee.id}`}
                aria-label={`本期固定费 ${index + 1}`}
                placeholder="沿用合同每期金额"
                value={fee.amount}
                inputMode="decimal"
                onChange={(event) =>
                  onChange(
                    "overrideFixedFees",
                    draft.overrideFixedFees.map((item) =>
                      item.id === fee.id ? { ...item, amount: event.target.value } : item,
                    ),
                  )
                }
              />
              {errors.get(`overrideFixedFees.${index}.amount`) ? (
                <p role="alert" className="text-destructive">
                  {errors.get(`overrideFixedFees.${index}.amount`)}
                </p>
              ) : null}
            </label>
          ))}
          <label htmlFor={`${fieldId}-reason`} className="space-y-1 text-sm sm:col-span-2">
            <span>本期收费调整原因</span>
            <Input
              id={`${fieldId}-reason`}
              aria-label="本期收费调整原因"
              value={draft.overrideReason}
              onChange={(event) => onChange("overrideReason", event.target.value)}
            />
            {errors.get("overrideReason") ? (
              <p role="alert" className="text-destructive">
                {errors.get("overrideReason")}
              </p>
            ) : null}
          </label>
        </div>
      </details>
      <ExtraFeeFields
        fees={draft.extraFees}
        errorsById={feeErrors}
        onChange={(fees) => onChange("extraFees", fees)}
      />
    </fieldset>
  );
}
