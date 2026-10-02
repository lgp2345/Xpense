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
import { ContractChargeFields } from "./contract-charge-fields";
import {
  contractChargeFormSchema,
  toContractChargeSetup,
  toContractChargeValues,
} from "./contract-charge-form";

const chargesFormSchema = contractChargeFormSchema.safeExtend({
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
      ...toContractChargeValues(terms),
      reason: "",
    },
    validators: { onChange: chargesFormSchema, onSubmit: chargesFormSchema },
    onSubmit: async ({ value }) => {
      setBusy(true);
      setError(null);
      const input = {
        contractId,
        expectedVersion: terms.version,
        idempotencyKey: crypto.randomUUID(),
        reason: value.reason.trim(),
        ...toContractChargeSetup(value).chargeTerms,
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
  const setText = (name: "reason", value: string) => {
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
      <p className="text-sm text-muted-foreground">
        仅影响之后生成的账单；已生成账单请在账单中调整。
      </p>
      <ContractChargeFields
        value={values}
        disabled={busy}
        showBaselines={false}
        confirmRemoval
        errors={Object.fromEntries(
          issues
            .filter((issue) => validationAttempted || issue.path[0] !== "reason")
            .map((issue) => [issue.path.join("."), issue.message]),
        )}
        onChange={(next) => {
          form.setFieldValue("waterCollectionEnabled", next.waterCollectionEnabled);
          form.setFieldValue("electricityCollectionEnabled", next.electricityCollectionEnabled);
          form.setFieldValue("waterUnitPrice", next.waterUnitPrice);
          form.setFieldValue("electricityUnitPrice", next.electricityUnitPrice);
          form.setFieldValue("fixedFees", next.fixedFees);
          changed();
        }}
      />
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
