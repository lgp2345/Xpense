import type { RentalBillTerminationReference, RentalTerminationPreview } from "@xpense/shared";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatBillAmount as formatMoney } from "./bill-format";
import { parseTerminationAmount } from "./bill-generation-form";
export function TerminationBillingFields({
  preview,
  amountText,
  reason,
  onAmountChange,
  onReasonChange,
  disabled = false,
}: {
  preview: RentalBillTerminationReference | RentalTerminationPreview;
  amountText: string;
  reason: string;
  onAmountChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="终止当期财务确认">
      <p className="text-sm">
        原付款账期 {preview.periodStart.replaceAll("-", "/")} 至{" "}
        {preview.periodEnd.replaceAll("-", "/")}
      </p>
      <p className="text-sm tabular-nums">
        原始应收 {formatMoney(preview.originalAmountMinor)} · 截至终止日参考{" "}
        {formatMoney(preview.referenceAmountMinor)}
      </p>
      <p className="text-xs text-muted-foreground">
        最终应收为这一整张付款账单的总额，允许零。收款情况尚未登记。
      </p>
      <Field>
        <FieldLabel htmlFor="termination-final-amount">终止当期最终应收</FieldLabel>
        <Input
          id="termination-final-amount"
          inputMode="decimal"
          value={amountText}
          disabled={disabled}
          onChange={(event) => onAmountChange(event.target.value)}
          aria-invalid={Boolean(amountText && parseTerminationAmount(amountText) === null)}
        />
        {amountText && parseTerminationAmount(amountText) === null ? (
          <p className="text-xs text-destructive">请输入非负金额，最多两位小数。</p>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="termination-billing-reason">金额确认原因</FieldLabel>
        <Input
          id="termination-billing-reason"
          maxLength={1000}
          value={reason}
          disabled={disabled}
          onChange={(event) => onReasonChange(event.target.value)}
        />
        {!reason.trim() ? (
          <p className="text-xs text-muted-foreground">确认最终应收必须填写原因。</p>
        ) : null}
      </Field>
    </section>
  );
}
