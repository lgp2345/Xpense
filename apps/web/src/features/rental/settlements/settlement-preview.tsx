import type {
  RentalBillLine,
  RentalSettlementPreview as RentalSettlementPreviewData,
} from "@xpense/shared";
import { useId } from "react";
import { z } from "zod";
import { DatePickerInput } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import { formatBillAmount } from "../bills/bill-format";
import { parseSignedMoneyMinor } from "../bills/monthly-bill-form";

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
    readingDate: z.string(),
    waterReading: reading,
    electricityReading: reading,
    extraName: z.string(),
    extraAmount: z.string(),
    extraNote: z.string(),
  })
  .superRefine((value, context) => {
    const hasReading = Boolean(value.waterReading || value.electricityReading);
    if (hasReading && !/^\d{4}-\d{2}-\d{2}$/.test(value.readingDate))
      context.addIssue({ code: "custom", path: ["readingDate"], message: "请选择读数日期。" });
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
};

export function SettlementPreview({ preview }: { preview: RentalSettlementPreviewData }) {
  const effectiveMonth = preview.effectiveEndDate.slice(0, 7);
  const lines = preview.billChanges.flatMap((change) =>
    change.lines.map((line) => ({ month: change.billingMonth, line })),
  );
  const monthlyLines = lines.filter(({ line }) => !isSettlementExtra(line));
  const settlementExtras = lines.filter(({ line }) => isSettlementExtra(line));
  const withdrawals = preview.billChanges.filter(
    (change) =>
      change.billingMonth > effectiveMonth && change.amountMinor === 0 && change.lines.length === 0,
  );

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="结算预览">
      <h2 className="font-semibold">结算预览 · 截至 {preview.effectiveEndDate}</h2>
      {!preview.canConfirm && preview.missingFields.length ? (
        <ul className="space-y-1 text-sm text-destructive" aria-label="待补信息">
          {preview.missingFields.map((field) => (
            <li key={field}>{missingFieldLabels[field] ?? `结算信息尚未补齐：${field}`}</li>
          ))}
        </ul>
      ) : null}
      {withdrawals.length ? (
        <section className="space-y-2" aria-label="待撤回账单">
          <h3 className="text-sm font-medium">未来账单</h3>
          <ul className="space-y-1 text-sm">
            {withdrawals.map((change) => (
              <li key={`${change.billingMonth}:${change.billId ?? "new"}`}>
                {change.billingMonth} · 本次撤回
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <FeeGroup title="月度费用" items={monthlyLines} />
      <FeeGroup title="退租补充费用" items={settlementExtras} />
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

function isSettlementExtra(line: RentalBillLine): boolean {
  return (
    line.kind === "extra_fee" &&
    line.feeSnapshot?.kind === "extra_fee" &&
    line.feeSnapshot.origin === "settlement"
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
