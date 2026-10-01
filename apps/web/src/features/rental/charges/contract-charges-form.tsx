import { useForm, useStore } from "@tanstack/react-form";
import type { RentalChargeTerms } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "../../../services/api-client";
import {
  createRentalFinanceAttempt,
  type RentalFinanceApi,
} from "../../../services/rental-finance-api";

type FeeValue = { id: string; name: string; amount: string };
type Values = {
  waterUnitPrice: string;
  electricityUnitPrice: string;
  fixedFees: FeeValue[];
  reason: string;
};

function parseFixedFeeAmount(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const minor = BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

function amountText(amountMinor: number): string {
  const amount = BigInt(amountMinor);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}

const chargesFormSchema = z.object({
  waterUnitPrice: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,4})?$/, "请输入最多四位小数的水费单价。"),
  electricityUnitPrice: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,4})?$/, "请输入最多四位小数的电费单价。"),
  fixedFees: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1, "请输入固定费用名称。"),
      amount: z
        .string()
        .refine((value) => parseFixedFeeAmount(value) !== null, "请输入有效固定费用金额。"),
    }),
  ),
  reason: z.string().trim().min(1, "请填写收费标准变更原因。"),
});

export function ContractChargesForm(props: {
  organizationId: string;
  contractId: string;
  api: RentalFinanceApi;
  terms: RentalChargeTerms;
  onSaved: () => void;
}) {
  return (
    <ChargesFormSession
      key={`${props.organizationId}:${props.contractId}:${props.terms.version}`}
      {...props}
    />
  );
}

function ChargesFormSession({
  contractId,
  api,
  terms,
  onSaved,
}: Parameters<typeof ContractChargesForm>[0]) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const attempt = useRef<{ submit: () => Promise<unknown> } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const form = useForm({
    defaultValues: {
      waterUnitPrice: terms.waterUnitPrice,
      electricityUnitPrice: terms.electricityUnitPrice,
      fixedFees: terms.fixedFees.map((fee) => ({
        id: fee.id,
        name: fee.name,
        amount: amountText(fee.monthlyAmountMinor),
      })),
      reason: "",
    } satisfies Values,
    validators: { onChange: chargesFormSchema, onSubmit: chargesFormSchema },
    onSubmit: async ({ value }) => {
      setBusy(true);
      setError(null);
      const input = {
        contractId,
        expectedVersion: terms.version,
        idempotencyKey: crypto.randomUUID(),
        reason: value.reason.trim(),
        waterUnitPrice: value.waterUnitPrice.trim(),
        electricityUnitPrice: value.electricityUnitPrice.trim(),
        fixedFees: value.fixedFees.map((fee) => ({
          id: fee.id,
          name: fee.name.trim(),
          monthlyAmountMinor: parseFixedFeeAmount(fee.amount) as number,
        })),
      };
      attempt.current ??= createRentalFinanceAttempt(api.updateChargeTerms, input);
      try {
        await attempt.current.submit();
        if (mounted.current) onSaved();
      } catch (cause) {
        if (!mounted.current) return;
        if (cause instanceof ApiError && cause.status === 409) {
          attempt.current = null;
          setError("收费标准已变化，请刷新合同后重试。");
        } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
          attempt.current = null;
          setError(cause.status === 403 ? "缺少调整收费标准的权限。" : cause.message);
        } else {
          setError("保存结果暂未确认，可重试原请求。");
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const parsed = chargesFormSchema.safeParse(values);
  const issues = parsed.success ? [] : parsed.error.issues;
  const fieldError = (path: string, value: string) =>
    value || touched.has(path) || validationAttempted
      ? issues.find((issue) => issue.path.join(".") === path)?.message
      : undefined;
  const valid = parsed.success;
  const changed = () => {
    attempt.current = null;
    setError(null);
  };
  const setText = (name: "waterUnitPrice" | "electricityUnitPrice" | "reason", value: string) => {
    form.setFieldValue(name, value);
    changed();
  };

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setValidationAttempted(true);
        void form.handleSubmit();
      }}
    >
      <h3 className="font-medium">调整合同默认收费标准</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["waterUnitPrice", "electricityUnitPrice"] as const).map((name) => {
          const label = name === "waterUnitPrice" ? "水费单价" : "电费单价";
          const message = fieldError(name, values[name]);
          return (
            <label key={name} className="space-y-1 text-sm" htmlFor={`charge-${name}`}>
              <span>{label}</span>
              <Input
                aria-label={label}
                id={`charge-${name}`}
                inputMode="decimal"
                value={values[name]}
                disabled={busy}
                aria-invalid={Boolean(message)}
                aria-describedby={message ? `${name}-error` : undefined}
                onBlur={() => setTouched((current) => new Set(current).add(name))}
                onChange={(event) => setText(name, event.target.value)}
              />
              {message ? (
                <p id={`${name}-error`} role="alert">
                  {message}
                </p>
              ) : null}
            </label>
          );
        })}
      </div>
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-medium">固定月费</legend>
        {values.fixedFees.map((fee, index) => {
          const namePath = `fixedFees.${index}.name`;
          const amountPath = `fixedFees.${index}.amount`;
          const nameError = fieldError(namePath, fee.name);
          const amountError = fieldError(amountPath, fee.amount);
          return (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={fee.id}>
              <label className="space-y-1 text-sm" htmlFor={`fixed-fee-name-${fee.id}`}>
                <span>固定费用名称 {index + 1}</span>
                <Input
                  aria-label={`固定费用名称 ${index + 1}`}
                  id={`fixed-fee-name-${fee.id}`}
                  value={fee.name}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? `${fee.id}-name-error` : undefined}
                  onBlur={() => setTouched((current) => new Set(current).add(namePath))}
                  onChange={(event) => {
                    form.setFieldValue(`fixedFees[${index}].name`, event.target.value);
                    changed();
                  }}
                />
                {nameError ? (
                  <p id={`${fee.id}-name-error`} role="alert">
                    {nameError}
                  </p>
                ) : null}
              </label>
              <label className="space-y-1 text-sm" htmlFor={`fixed-fee-amount-${fee.id}`}>
                <span>固定费用金额（元） {index + 1}</span>
                <Input
                  aria-label={`固定费用金额（元） ${index + 1}`}
                  id={`fixed-fee-amount-${fee.id}`}
                  inputMode="decimal"
                  value={fee.amount}
                  aria-invalid={Boolean(amountError)}
                  aria-describedby={amountError ? `${fee.id}-amount-error` : undefined}
                  onBlur={() => setTouched((current) => new Set(current).add(amountPath))}
                  onChange={(event) => {
                    form.setFieldValue(`fixedFees[${index}].amount`, event.target.value);
                    changed();
                  }}
                />
                {amountError ? (
                  <p id={`${fee.id}-amount-error`} role="alert">
                    {amountError}
                  </p>
                ) : null}
              </label>
              <Button
                className="self-end"
                type="button"
                variant="outline"
                aria-label={`移除固定费用 ${index + 1}`}
                onClick={() => {
                  form.setFieldValue(
                    "fixedFees",
                    values.fixedFees.filter(({ id }) => id !== fee.id),
                  );
                  changed();
                }}
              >
                移除
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            form.setFieldValue("fixedFees", [
              ...values.fixedFees,
              { id: crypto.randomUUID(), name: "", amount: "0.00" },
            ]);
            changed();
          }}
        >
          添加固定月费
        </Button>
      </fieldset>
      <label className="block space-y-1 text-sm" htmlFor="charge-change-reason">
        <span>收费标准变更原因</span>
        <Input
          aria-label="收费标准变更原因"
          id="charge-change-reason"
          value={values.reason}
          disabled={busy}
          aria-invalid={Boolean(fieldError("reason", values.reason))}
          aria-describedby={fieldError("reason", values.reason) ? "reason-error" : undefined}
          onBlur={() => setTouched((current) => new Set(current).add("reason"))}
          onChange={(event) => setText("reason", event.target.value)}
        />
        {fieldError("reason", values.reason) ? (
          <p id="reason-error" role="alert">
            {fieldError("reason", values.reason)}
          </p>
        ) : null}
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <Button type="submit" disabled={busy || (!valid && !attempt.current)}>
        {busy
          ? "正在保存…"
          : error === "保存结果暂未确认，可重试原请求。"
            ? "重试原请求"
            : "保存收费标准"}
      </Button>
    </form>
  );
}
