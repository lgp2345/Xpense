import type {
  RentalBillLine,
  RentalSettlementPreview as RentalSettlementPreviewData,
} from "@xpense/shared";
import { useId } from "react";
import { z } from "zod";
import { DatePickerInput } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import { formatBillAmount } from "../bills/bill-format";
import { parseSignedMoneyMinor } from "../bills/period-bill-form";

export function fieldMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return undefined;
}

const reading = z
  .string()
  .refine(
    (value) => !value || /^\d{1,12}(?:\.\d{1,4})?$/.test(value),
    "请输入非负数字，最多四位小数。",
  );
export const settlementDraftSchema = z
  .object({
    waterReading: reading,
    electricityReading: reading,
    extraName: z.string(),
    extraAmount: z.string(),
    extraNote: z.string(),
  })
  .superRefine((value, context) => {
    const hasExtraName = Boolean(value.extraName.trim());
    const hasExtraAmount = Boolean(value.extraAmount.trim());
    if (hasExtraName !== hasExtraAmount)
      context.addIssue({
        code: "custom",
        path: [hasExtraName ? "extraAmount" : "extraName"],
        message: "补充费用名称和金额需要同时填写。",
      });
    if (hasExtraAmount && parseSignedMoneyMinor(value.extraAmount) === null)
      context.addIssue({
        code: "custom",
        path: ["extraAmount"],
        message: "请输入有效金额，最多两位小数。",
      });
  });

const missingFieldLabels: Record<string, string> = {
  waterReading: "水表终读数尚未填写。",
  electricityReading: "电表终读数尚未填写。",
  waterBaseline: "水表入住底数待补，请在合同详情登记。",
  electricityBaseline: "电表入住底数待补，请在合同详情登记。",
};

export function SettlementPreview({ preview }: { preview: RentalSettlementPreviewData }) {
  const periodLines = preview.periodCharges.flatMap((charge) =>
    charge.lines.map((line) => ({
      month: `${charge.period.periodStart} 至 ${charge.period.periodEnd}`,
      line,
    })),
  );
  const terminalLines = preview.terminalLines.map((line) => ({
    month: preview.effectiveEndDate,
    line,
  }));
  const extraLines = preview.extraLines.map((line) => ({ month: preview.effectiveEndDate, line }));
  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="结算预览">
      <h2 className="font-semibold">结算预览 · 截至 {preview.effectiveEndDate}</h2>
      {!preview.canConfirm && preview.missingFields.length ? (
        <ul className="space-y-1 text-sm text-destructive" aria-label="待补信息">
          {preview.missingFields.map((field) => (
            <li key={field}>{missingFieldLabels[field] ?? "结算资料尚未补齐。"}</li>
          ))}
        </ul>
      ) : null}
      <FeeGroup title="账期费用" items={periodLines} />
      <FeeGroup title="尾期水电" items={terminalLines} />
      <FeeGroup title="固定费用退款事项与额外费用" items={extraLines} />
      <p className="text-sm text-muted-foreground">
        固定费用不自动退款。负费用减少结算成本，实际退款仍需单独登记。
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3 text-sm tabular-nums">
        <span>最终费用 {formatBillAmount(preview.finalCostMinor)}</span>
        <span>实际收款 {formatBillAmount(preview.receivedMinor)}</span>
        <span>实际退款 {formatBillAmount(preview.refundedMinor)}</span>
        <span className="font-semibold">最终差额 {formatBillAmount(preview.differenceMinor)}</span>
      </div>
    </section>
  );
}

function FeeGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ month: string; line: RentalBillLine }>;
}) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length ? (
        <ul className="divide-y text-sm">
          {items.map(({ month, line }) => (
            <li
              className="flex flex-wrap justify-between gap-2 py-2"
              key={`${month}:${line.sortOrder}:${line.kind}:${line.label}`}
            >
              <span>
                {month} · {line.label}
              </span>
              <span className="tabular-nums">{formatBillAmount(line.amountMinor)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">暂无费用。</p>
      )}
    </section>
  );
}

export function FieldInput({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={inputId}>{label}</label>
      <Input
        id={inputId}
        aria-label={label}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function ReadingField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="block space-y-1 text-sm">
      <label htmlFor={inputId}>{label}</label>
      <Input
        id={inputId}
        aria-label={label}
        inputMode="decimal"
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span role="alert" className="block text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function MoneyField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={inputId}>{label}</label>
      <Input
        id={inputId}
        aria-label={label}
        inputMode="decimal"
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function DateField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={inputId}>{label}</label>
      <DatePickerInput
        id={inputId}
        aria-label={label}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(date) => onChange(date ?? "")}
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={inputId}>{label}</label>
      <Input
        id={inputId}
        aria-label={label}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
