import { useId } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** 渲染带就近错误信息的交易选择字段。 */
export function TransactionSelectField({
  error,
  label,
  onChange,
  options,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  const id = useId();
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-label={label}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}

/** 从 TanStack Form/Zod 错误中提取首条用户消息。 */
export function transactionValidationMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return undefined;
  if ("message" in error && typeof error.message === "string") return error.message;
  if ("issues" in error && Array.isArray(error.issues)) {
    const issue = error.issues[0];
    if (
      issue &&
      typeof issue === "object" &&
      "message" in issue &&
      typeof issue.message === "string"
    ) {
      return issue.message;
    }
  }
  return undefined;
}
