import type { RentalBillPreview } from "@xpense/shared";
import { DatePickerInput } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { formatBillAmount as formatMoney } from "./bill-format";
import type { BillGenerationValues } from "./bill-generation-form";
import { BillPreviewTable } from "./bill-preview-table";
import { DepositBillPreview } from "./deposit-bill-preview";
import { TerminationBillingFields } from "./termination-billing-fields";

export type BillGenerationPreviewProps = {
  preview: RentalBillPreview;
  values: BillGenerationValues;
  busy: boolean;
  valid: boolean;
  onValuesChange: (updates: Partial<BillGenerationValues>) => void;
  onPageChange: (page: number) => void;
};

export function BillGenerationPreview({
  scope,
  ...props
}: BillGenerationPreviewProps & { scope?: "deposits" }) {
  if (scope === "deposits") return <DepositBillPreview {...props} />;
  const { preview, values, busy, valid, onValuesChange, onPageChange } = props;
  const depositInputs =
    preview.depositInputs ??
    preview.missingDepositSourceKeys.map((sourceKey) => ({
      sourceKey,
      label:
        preview.items
          .find((item) => item.sourceKey === sourceKey)
          ?.lines.find((line) => line.kind === "deposit")?.label ?? "押金",
    }));
  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-1 text-sm">
        <p>
          新增 {preview.createCount} 张 · 已存在 {preview.existingCount} 张
        </p>
        <p className="tabular-nums">
          本次新增租金 {formatMoney(preview.createTotals.rentAmountMinor)} · 押金{" "}
          {formatMoney(preview.createTotals.depositAmountMinor)}
        </p>
      </div>
      {depositInputs.length ? (
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <legend className="text-sm font-medium">新增押金到期日（必填）</legend>
          <div className="flex flex-wrap items-center gap-2">
            <DatePickerInput
              aria-label="统一押金到期日"
              value={values.unifiedDate}
              onChange={(date) => onValuesChange({ unifiedDate: date ?? "" })}
            />
            <Button
              variant="outline"
              disabled={!values.unifiedDate || busy}
              onClick={() =>
                onValuesChange({
                  depositDueDates: Object.fromEntries(
                    depositInputs.map(({ sourceKey }) => [sourceKey, values.unifiedDate]),
                  ),
                })
              }
            >
              应用到新增押金
            </Button>
          </div>
          {depositInputs.map(({ sourceKey, label }, index) => (
            <div className="space-y-1" key={sourceKey}>
              <label className="text-xs text-muted-foreground" htmlFor={`deposit-date-${index}`}>
                {label}（{index + 1}）到期日
              </label>
              <DatePickerInput
                id={`deposit-date-${index}`}
                value={values.depositDueDates[sourceKey]}
                onChange={(date) => {
                  const dates = { ...values.depositDueDates };
                  if (date) dates[sourceKey] = date;
                  else delete dates[sourceKey];
                  onValuesChange({ depositDueDates: dates });
                }}
              />
            </div>
          ))}
        </fieldset>
      ) : null}
      {preview.terminationReference ? (
        <TerminationBillingFields
          preview={preview.terminationReference}
          amountText={values.amountText}
          reason={values.reason}
          disabled={busy}
          onAmountChange={(amountText) => onValuesChange({ amountText })}
          onReasonChange={(reason) => onValuesChange({ reason })}
        />
      ) : null}
      <BillPreviewTable preview={preview} disabled={busy || !valid} onPageChange={onPageChange} />
    </div>
  );
}
