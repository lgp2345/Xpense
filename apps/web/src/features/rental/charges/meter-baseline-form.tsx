import { useForm, useStore } from "@tanstack/react-form";
import type { RentalMeterReadingInput } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { DatePickerInput } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "../../../services/api-client";
import {
  createRentalFinanceAttempt,
  type RentalFinanceApi,
  type RentalMeterBaseline,
} from "../../../services/rental-finance-api";
import { isCalendarDate } from "../contracts/contract-action-model";

type Values = {
  waterDate: string;
  waterReading: string;
  electricityDate: string;
  electricityReading: string;
  reason: string;
};
const meterBaselineSchema = z.object({
  waterDate: z.string().refine(isCalendarDate, "请输入有效水表读数日期。"),
  waterReading: z.string().regex(/^\d+(?:\.\d{1,4})?$/, "请输入最多四位小数的水表底数。"),
  electricityDate: z.string().refine(isCalendarDate, "请输入有效电表读数日期。"),
  electricityReading: z.string().regex(/^\d+(?:\.\d{1,4})?$/, "请输入最多四位小数的电表底数。"),
  reason: z.string().trim().min(1, "请填写底数变更原因。"),
});

export function MeterBaselineForm(props: {
  organizationId: string;
  contractId: string;
  api: RentalFinanceApi;
  baseline: RentalMeterBaseline;
  onSaved: () => void;
}) {
  return (
    <MeterBaselineSession
      key={`${props.organizationId}:${props.contractId}:${props.baseline.version}`}
      {...props}
    />
  );
}

function MeterBaselineSession({
  contractId,
  api,
  baseline,
  onSaved,
}: Parameters<typeof MeterBaselineForm>[0]) {
  const reading = (kind: RentalMeterReadingInput["kind"]) =>
    baseline.readings.find((item) => item.kind === kind);
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
      waterDate: reading("water")?.readingDate ?? "",
      waterReading: reading("water")?.reading ?? "",
      electricityDate: reading("electricity")?.readingDate ?? "",
      electricityReading: reading("electricity")?.reading ?? "",
      reason: "",
    } satisfies Values,
    validators: { onChange: meterBaselineSchema, onSubmit: meterBaselineSchema },
    onSubmit: async ({ value }) => {
      setBusy(true);
      setError(null);
      const input = {
        contractId,
        expectedVersion: baseline.version,
        idempotencyKey: crypto.randomUUID(),
        reason: value.reason.trim(),
        readings: [
          {
            kind: "water" as const,
            readingDate: value.waterDate,
            reading: value.waterReading.trim(),
          },
          {
            kind: "electricity" as const,
            readingDate: value.electricityDate,
            reading: value.electricityReading.trim(),
          },
        ],
      };
      attempt.current ??= createRentalFinanceAttempt(api.updateMeterBaseline, input);
      try {
        await attempt.current.submit();
        if (mounted.current) onSaved();
      } catch (cause) {
        if (!mounted.current) return;
        if (cause instanceof ApiError && cause.status === 409) {
          attempt.current = null;
          setError("入住底数已变化，请刷新合同后重试。");
        } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
          attempt.current = null;
          setError(cause.status === 403 ? "缺少调整入住底数的权限。" : cause.message);
        } else {
          setError("保存结果暂未确认，可重试原请求。");
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const parsed = meterBaselineSchema.safeParse(values);
  const issues = parsed.success ? [] : parsed.error.issues;
  const fieldError = (name: keyof Values, value: string) =>
    value || touched.has(name) || validationAttempted
      ? issues.find((issue) => issue.path[0] === name)?.message
      : undefined;
  const valid = parsed.success;
  const change = (name: keyof Values, value: string) => {
    form.setFieldValue(name, value);
    attempt.current = null;
    setError(null);
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
      <h3 className="font-medium">登记或更正入住底数</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["water", "electricity"] as const).map((kind) => {
          const prefix = kind === "water" ? "water" : "electricity";
          const label = kind === "water" ? "水表" : "电表";
          const dateKey = `${prefix}Date` as "waterDate" | "electricityDate";
          const readingKey = `${prefix}Reading` as "waterReading" | "electricityReading";
          const dateError = fieldError(dateKey, values[dateKey]);
          const readingError = fieldError(readingKey, values[readingKey]);
          return (
            <div className="space-y-2" key={kind}>
              <div className="space-y-1 text-sm">
                <span className="block">{label}底数日期</span>
                <DatePickerInput
                  aria-label={`${label}底数日期`}
                  value={values[dateKey]}
                  aria-invalid={Boolean(dateError)}
                  aria-describedby={dateError ? `${dateKey}-error` : undefined}
                  disabled={busy}
                  onBlur={() => setTouched((current) => new Set(current).add(dateKey))}
                  onChange={(date) => {
                    setTouched((current) => new Set(current).add(dateKey));
                    change(dateKey, date ?? "");
                  }}
                />
                {dateError ? (
                  <p id={`${dateKey}-error`} role="alert">
                    {dateError}
                  </p>
                ) : null}
              </div>
              <label className="block space-y-1 text-sm" htmlFor={`meter-${kind}-reading`}>
                <span>{label}底数</span>
                <Input
                  aria-label={`${label}底数`}
                  id={`meter-${kind}-reading`}
                  inputMode="decimal"
                  value={values[readingKey]}
                  disabled={busy}
                  aria-invalid={Boolean(readingError)}
                  aria-describedby={readingError ? `${readingKey}-error` : undefined}
                  onBlur={() => setTouched((current) => new Set(current).add(readingKey))}
                  onChange={(event) => change(readingKey, event.target.value)}
                />
                {readingError ? (
                  <p id={`${readingKey}-error`} role="alert">
                    {readingError}
                  </p>
                ) : null}
              </label>
            </div>
          );
        })}
      </div>
      <label className="block space-y-1 text-sm" htmlFor="meter-baseline-reason">
        <span>底数变更原因</span>
        <Input
          aria-label="底数变更原因"
          id="meter-baseline-reason"
          value={values.reason}
          disabled={busy}
          aria-invalid={Boolean(fieldError("reason", values.reason))}
          aria-describedby={fieldError("reason", values.reason) ? "reason-error" : undefined}
          onBlur={() => setTouched((current) => new Set(current).add("reason"))}
          onChange={(event) => change("reason", event.target.value)}
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
            : "保存入住底数"}
      </Button>
    </form>
  );
}
