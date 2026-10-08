import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PeriodBillExtraFeeDraft } from "./period-bill-form";

export function ExtraFeeFields({
  fees,
  onChange,
  disabled = false,
  errorsById,
}: {
  fees: PeriodBillExtraFeeDraft[];
  onChange: (fees: PeriodBillExtraFeeDraft[]) => void;
  disabled?: boolean;
  errorsById?: ReadonlyMap<string, Partial<Record<"name" | "amount" | "note", string>>>;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="font-medium text-sm">额外费用</legend>
      {fees.map((fee, index) => (
        <div className="border rounded-md min-w-0 grid p-3 gap-2 sm:grid-cols-2" key={fee.id}>
          <FeeInput
            id={`extra-fee-name-${fee.id}`}
            label={`额外费用名称 ${index + 1}`}
            value={fee.name}
            error={errorsById?.get(fee.id)?.name}
            onChange={(value) =>
              onChange(fees.map((item) => (item.id === fee.id ? { ...item, name: value } : item)))
            }
          />
          <FeeInput
            id={`extra-fee-amount-${fee.id}`}
            label={`额外费用金额（元） ${index + 1}`}
            value={fee.amount}
            error={errorsById?.get(fee.id)?.amount}
            inputMode="decimal"
            onChange={(value) =>
              onChange(fees.map((item) => (item.id === fee.id ? { ...item, amount: value } : item)))
            }
          />
          <FeeInput
            id={`extra-fee-note-${fee.id}`}
            label={`额外费用备注 ${index + 1}`}
            value={fee.note}
            error={errorsById?.get(fee.id)?.note}
            className="sm:col-span-2"
            onChange={(value) =>
              onChange(fees.map((item) => (item.id === fee.id ? { ...item, note: value } : item)))
            }
          />
          <Button
            type="button"
            variant="outline"
            className="sm:col-span-2 sm:justify-self-start"
            aria-label={`移除额外费用 ${index + 1}`}
            onClick={() => onChange(fees.filter((item) => item.id !== fee.id))}
          >
            移除费用
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([...fees, { id: crypto.randomUUID(), name: "", amount: "", note: "" }])
        }
      >
        添加额外费用
      </Button>
    </fieldset>
  );
}

function FeeInput({
  id,
  label,
  value,
  onChange,
  error,
  className,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
  inputMode?: "decimal";
}) {
  const errorId = `${id}-error`;
  return (
    <div className={`space-y-1 text-sm ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      <Input
        aria-label={label}
        id={id}
        inputMode={inputMode}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
