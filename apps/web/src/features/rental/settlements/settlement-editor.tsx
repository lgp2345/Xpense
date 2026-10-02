import { useForm, useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PermissionKey,
  PreviewRentalSettlementRequest,
  RentalSettlementDetail,
  RentalSettlementPreview as RentalSettlementPreviewData,
} from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { DatePickerInput } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { ApiError } from "../../../services/api-client";
import {
  createRentalFinanceAttempt,
  type RentalFinanceApi,
} from "../../../services/rental-finance-api";
import { invalidateRentalFinance, rentalFinanceKeys } from "../../../services/rental-finance-query";
import { parseSignedMoneyMinor } from "../bills/monthly-bill-form";
import {
  FieldInput,
  fieldMessage,
  ReadingField,
  SettlementPreview,
  settlementDraftSchema,
} from "./settlement-preview";

export function SettlementEditor({
  organizationId,
  contractId,
  permissions,
  api,
}: {
  organizationId: string;
  contractId: string;
  permissions: readonly PermissionKey[];
  api: RentalFinanceApi;
}) {
  const queryClient = useQueryClient();
  const canConfirm = permissions.includes("rental_settlements:confirm");
  const canReadCharges = permissions.includes("rental_charges:read");
  const terms = useQuery({
    queryKey: rentalFinanceKeys.chargeTerms(organizationId, contractId),
    queryFn: ({ signal }) => api.getChargeTerms(contractId, { signal }),
    enabled: canReadCharges,
  });
  const collected = (kind: "water" | "electricity") =>
    !canReadCharges || Boolean(terms.data?.[`${kind}CollectionEnabled`]);
  const contextKey = `${organizationId}:${contractId}`;
  const liveContext = useRef(contextKey);
  liveContext.current = contextKey;
  const mounted = useRef(true);
  const previewSequence = useRef(0);
  const confirmationAttempt = useRef<{ submit: () => Promise<RentalSettlementDetail> } | null>(
    null,
  );
  const [preview, setPreview] = useState<RentalSettlementPreviewData | null>(null);
  const [previewRequest, setPreviewRequest] = useState<PreviewRentalSettlementRequest | null>(null);
  const [effectiveEndDate, setEffectiveEndDate] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [operation, setOperation] = useState<"preview" | "confirm" | null>(null);
  const busy = operation !== null;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const form = useForm({
    defaultValues: {
      readingDate: "",
      waterReading: "",
      electricityReading: "",
      extraName: "",
      extraAmount: "",
      extraNote: "",
    },
    validators: { onSubmit: settlementDraftSchema },
    onSubmit: async ({ value }) => {
      if (!canConfirm || operation === "confirm") return;
      if (canReadCharges && !terms.data) return;
      const request = createPreviewRequest(
        contractId,
        {
          ...value,
          waterReading: collected("water") ? value.waterReading : "",
          electricityReading: collected("electricity") ? value.electricityReading : "",
        },
        effectiveEndDate,
      );
      if (!request) return;
      setOperation("preview");
      setError(null);
      const capturedContext = contextKey;
      const sequence = ++previewSequence.current;
      const isCurrent = () =>
        mounted.current &&
        liveContext.current === capturedContext &&
        previewSequence.current === sequence;
      try {
        const result = await api.previewSettlement(request);
        if (!isCurrent()) return;
        if (!value.readingDate) form.setFieldValue("readingDate", result.effectiveEndDate);
        setPreviewRequest(request);
        setPreview(result);
        setEffectiveEndDate(result.effectiveEndDate);
        setMissingFields(result.missingFields);
        confirmationAttempt.current = null;
      } catch (cause) {
        if (!isCurrent()) return;
        setError(
          cause instanceof ApiError && cause.status > 0 && cause.status < 500
            ? cause.message
            : "结算预览结果暂未确认，请重试。",
        );
      } finally {
        if (isCurrent()) setOperation(null);
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const confirm = async () => {
    if (!preview?.canConfirm || !previewRequest || !canConfirm || busy) return;
    const input = {
      ...structuredClone(previewRequest),
      expectedVersion: preview.version,
      idempotencyKey: crypto.randomUUID(),
    };
    confirmationAttempt.current ??= createRentalFinanceAttempt(api.confirmSettlement, input);
    const capturedContext = contextKey;
    setOperation("confirm");
    setError(null);
    try {
      await confirmationAttempt.current.submit();
      if (!mounted.current || liveContext.current !== capturedContext) return;
      confirmationAttempt.current = null;
      setPreview(null);
      setPreviewRequest(null);
      void invalidateRentalFinance(queryClient, organizationId, contractId);
    } catch (cause) {
      if (!mounted.current || liveContext.current !== capturedContext) return;
      if (cause instanceof ApiError && cause.status === 409) {
        confirmationAttempt.current = null;
        setPreview(null);
        setPreviewRequest(null);
        setError("结算信息已变化，请重新预览后确认。");
      } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
        confirmationAttempt.current = null;
        setError(cause.status === 403 ? "你没有确认退租结算的权限。" : cause.message);
      } else {
        setError("结算确认结果暂未确认，可重试原请求。");
      }
    } finally {
      if (mounted.current && liveContext.current === capturedContext) setOperation(null);
    }
  };

  const clearPreview = () => {
    if (operation === "confirm") return;
    previewSequence.current += 1;
    setOperation(null);
    setPreview(null);
    setPreviewRequest(null);
    confirmationAttempt.current = null;
    setError(null);
  };

  return (
    <section className="space-y-4" aria-label="准备退租结算">
      <form
        noValidate
        className="rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <fieldset disabled={operation === "confirm"} className="space-y-4">
          <div>
            <h2 className="font-semibold">准备结算</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              合同结束后录入终读数和退租补充费用，再查看最终差额。
            </p>
          </div>
          {collected("water") && (missingFields.includes("waterReading") || values.waterReading) ? (
            <form.Field name="waterReading">
              {(field) => (
                <ReadingField
                  label="水表终读数"
                  value={field.state.value}
                  error={
                    field.state.meta.isTouched
                      ? fieldMessage(field.state.meta.errors[0])
                      : undefined
                  }
                  onChange={(value) => {
                    field.handleChange(value);
                    clearPreview();
                  }}
                />
              )}
            </form.Field>
          ) : null}
          {collected("electricity") &&
          (missingFields.includes("electricityReading") || values.electricityReading) ? (
            <form.Field name="electricityReading">
              {(field) => (
                <ReadingField
                  label="电表终读数"
                  value={field.state.value}
                  error={
                    field.state.meta.isTouched
                      ? fieldMessage(field.state.meta.errors[0])
                      : undefined
                  }
                  onChange={(value) => {
                    field.handleChange(value);
                    clearPreview();
                  }}
                />
              )}
            </form.Field>
          ) : null}
          {missingFields.length ? (
            <form.Field name="readingDate">
              {(field) => (
                <div className="space-y-1 text-sm">
                  <label htmlFor="settlement-reading-date">终读数日期</label>
                  <DatePickerInput
                    id="settlement-reading-date"
                    aria-label="终读数日期"
                    value={field.state.value || effectiveEndDate}
                    onChange={(value) => {
                      field.handleChange(value ?? "");
                      clearPreview();
                    }}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors[0] ? (
                    <p role="alert" className="text-destructive">
                      {fieldMessage(field.state.meta.errors[0])}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <form.Field name="extraName">
              {(field) => (
                <FieldInput
                  label="退租补充费用"
                  value={field.state.value}
                  error={
                    field.state.meta.isTouched
                      ? fieldMessage(field.state.meta.errors[0])
                      : undefined
                  }
                  onChange={(value) => {
                    field.handleChange(value);
                    clearPreview();
                  }}
                />
              )}
            </form.Field>
            <form.Field name="extraAmount">
              {(field) => (
                <FieldInput
                  label="补充费用金额（元）"
                  value={field.state.value}
                  error={
                    field.state.meta.isTouched
                      ? fieldMessage(field.state.meta.errors[0])
                      : undefined
                  }
                  onChange={(value) => {
                    field.handleChange(value);
                    clearPreview();
                  }}
                />
              )}
            </form.Field>
            <form.Field name="extraNote">
              {(field) => (
                <FieldInput
                  label="补充费用备注"
                  value={field.state.value}
                  onChange={(value) => {
                    field.handleChange(value);
                    clearPreview();
                  }}
                />
              )}
            </form.Field>
          </div>
          <Button type="submit" disabled={busy || !canConfirm || (canReadCharges && !terms.data)}>
            {operation === "preview" ? "正在读取预览…" : "预览结算"}
          </Button>
        </fieldset>
      </form>
      {canReadCharges && terms.isError ? (
        <p role="alert">
          收费标准读取失败，
          <Button variant="outline" onClick={() => void terms.refetch()}>
            重试收费标准
          </Button>
        </p>
      ) : null}
      {preview ? <SettlementPreview preview={preview} /> : null}
      <Button disabled={!canConfirm || !preview?.canConfirm || busy} onClick={() => void confirm()}>
        确认结算
      </Button>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function createPreviewRequest(
  contractId: string,
  value: z.infer<typeof settlementDraftSchema>,
  effectiveEndDate: string,
): PreviewRentalSettlementRequest | null {
  const finalReadings = (
    [
      ["water", value.waterReading],
      ["electricity", value.electricityReading],
    ] as const
  ).flatMap(([kind, meterReading]) =>
    meterReading
      ? [{ kind, readingDate: value.readingDate || effectiveEndDate, reading: meterReading }]
      : [],
  );
  const extraFees =
    value.extraName.trim() && value.extraAmount.trim()
      ? [
          {
            id: crypto.randomUUID(),
            name: value.extraName.trim(),
            amountMinor: parseSignedMoneyMinor(value.extraAmount) ?? 0,
            note: value.extraNote.trim(),
          },
        ]
      : [];
  return {
    contractId,
    ...(finalReadings.length ? { finalReadings } : {}),
    extraFees,
  };
}
