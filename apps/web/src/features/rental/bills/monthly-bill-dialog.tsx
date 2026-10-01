import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import type {
  GenerateRentalMonthlyBillRequest,
  RentalBillDetail,
  RentalMonthlyBillPreview,
} from "@xpense/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { DatePickerInput } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "../../../services/api-client";
import {
  createRentalFinanceAttempt,
  type RentalFinanceApi,
} from "../../../services/rental-finance-api";
import { rentalFinanceKeys } from "../../../services/rental-finance-query";
import { formatBillAmount } from "./bill-format";
import { ExtraFeeFields } from "./extra-fee-fields";
import { MeterReadingFields } from "./meter-reading-fields";
import {
  type MonthlyBillDraft,
  monthlyBillDraftSchema,
  toMonthlyBillPreviewRequest,
} from "./monthly-bill-form";

type Props = {
  organizationId: string;
  contractId: string;
  api: RentalFinanceApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (bill: RentalBillDetail) => void;
};

type PreviewState = { fingerprint: string; data: RentalMonthlyBillPreview };

export function MonthlyBillDialog(props: Props) {
  return props.open ? (
    <MonthlyBillSession key={`${props.organizationId}:${props.contractId}`} {...props} />
  ) : null;
}

function MonthlyBillSession({ organizationId, contractId, api, onOpenChange, onGenerated }: Props) {
  const confirmAction = useRef<() => Promise<void>>(async () => {});
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const form = useForm({
    defaultValues: {
      billingMonth: "",
      dueDate: "",
      readings: {
        water: { readingDate: "", reading: "" },
        electricity: { readingDate: "", reading: "" },
      },
      extraFees: [] as MonthlyBillDraft["extraFees"],
    } satisfies MonthlyBillDraft,
    validators: { onChange: monthlyBillDraftSchema, onSubmit: monthlyBillDraftSchema },
    onSubmit: async () => confirmAction.current(),
  });
  const draft = useStore(form.store, (state) => state.values);
  const draftValidation = monthlyBillDraftSchema.safeParse(draft);
  const draftIssues = draftValidation.success ? [] : draftValidation.error.issues;
  const showFieldError = (path: string, value: string) =>
    Boolean(value) || validationAttempted || touched.has(path);
  const fieldError = (path: string, value: string) =>
    showFieldError(path, value)
      ? draftIssues.find((issue) => issue.path.join(".") === path)?.message
      : undefined;
  const extraFeeErrors = new Map<string, Partial<Record<"name" | "amount" | "note", string>>>();
  if (
    showFieldError(
      "extraFees",
      draft.extraFees.some((fee) => fee.name || fee.amount || fee.note) ? "entered" : "",
    )
  ) {
    for (const issue of draftIssues) {
      if (
        issue.path[0] !== "extraFees" ||
        typeof issue.path[1] !== "number" ||
        !["name", "amount", "note"].includes(String(issue.path[2]))
      )
        continue;
      const fee = draft.extraFees[issue.path[1]];
      if (fee) {
        const key = issue.path[2] as "name" | "amount" | "note";
        extraFeeErrors.set(fee.id, { ...extraFeeErrors.get(fee.id), [key]: issue.message });
      }
    }
  }
  const readingErrors: Partial<
    Record<"water" | "electricity", Partial<Record<"readingDate" | "reading", string>>>
  > = {};
  for (const kind of ["water", "electricity"] as const) {
    for (const field of ["readingDate", "reading"] as const) {
      const path = `readings.${kind}.${field}`;
      const message = fieldError(path, draft.readings[kind][field]);
      if (message) readingErrors[kind] = { ...readingErrors[kind], [field]: message };
    }
  }
  const request = useMemo(
    () => toMonthlyBillPreviewRequest(contractId, draft),
    [contractId, draft],
  );
  const fingerprint = request ? JSON.stringify(request) : "";
  const terms = useQuery({
    queryKey: rentalFinanceKeys.chargeTerms(organizationId, contractId),
    queryFn: ({ signal }) => api.getChargeTerms(contractId, { signal }),
  });
  const baseline = useQuery({
    queryKey: rentalFinanceKeys.meterBaseline(organizationId, contractId),
    queryFn: ({ signal }) => api.getMeterBaseline(contractId, { signal }),
  });
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ submit: () => Promise<RentalBillDetail> } | null>(null);
  const sequence = useRef(0);

  const invalidatePreview = () => {
    setPreview(null);
    setPreviewBusy(false);
    setError(null);
    attempt.current = null;
  };

  useEffect(() => {
    if (!request || !terms.data || !baseline.data) return;
    const controller = new AbortController();
    const currentSequence = ++sequence.current;
    setPreview(null);
    setPreviewBusy(true);
    setError(null);
    attempt.current = null;
    const timer = setTimeout(() => {
      void api
        .previewMonthlyBill(request, {
          signal: controller.signal,
          cancelKey: `monthly-bill-preview:${organizationId}:${contractId}:${previewNonce}`,
        })
        .then((data) => {
          if (!controller.signal.aborted && sequence.current === currentSequence) {
            setPreview({ fingerprint, data });
          }
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted && sequence.current === currentSequence) {
            setError(
              cause instanceof ApiError && cause.status === 409
                ? "收费依据已变化，请重新录入后预览。"
                : "月度账单预览失败，请重试。",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && sequence.current === currentSequence)
            setPreviewBusy(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (sequence.current === currentSequence) sequence.current++;
    };
  }, [
    api,
    baseline.data,
    contractId,
    fingerprint,
    organizationId,
    previewNonce,
    request,
    terms.data,
  ]);

  const setReading = (
    kind: "water" | "electricity",
    field: "readingDate" | "reading",
    value: string,
  ) => {
    setTouched((current) => new Set(current).add(`readings.${kind}.${field}`));
    form.setFieldValue(`readings.${kind}.${field}`, value);
    invalidatePreview();
  };
  const updateExtraFees = (extraFees: MonthlyBillDraft["extraFees"]) => {
    setTouched((current) => new Set(current).add("extraFees"));
    form.setFieldValue("extraFees", extraFees);
    invalidatePreview();
  };
  const currentPreview = preview?.fingerprint === fingerprint ? preview.data : null;
  const canConfirm = Boolean(
    request &&
      currentPreview?.canConfirm &&
      !previewBusy &&
      !submitBusy &&
      terms.data &&
      baseline.data,
  );

  const submit = async () => {
    if (!request || !currentPreview || !canConfirm || !request.dueDate || !request.readings) return;
    setSubmitBusy(true);
    setError(null);
    const payload: GenerateRentalMonthlyBillRequest = {
      ...request,
      dueDate: request.dueDate,
      readings: request.readings,
      expectedVersion: currentPreview.version,
      idempotencyKey: crypto.randomUUID(),
    };
    attempt.current ??= createRentalFinanceAttempt(api.generateMonthlyBill, payload);
    try {
      const bill = await attempt.current.submit();
      onGenerated(bill);
      onOpenChange(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        attempt.current = null;
        setPreview(null);
        setPreviewNonce((value) => value + 1);
        setError("账单来源已变化，请检查输入后重新预览。");
      } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
        attempt.current = null;
        setError(cause.status === 403 ? "缺少月度账单生成权限。" : cause.message);
      } else {
        setError("确认结果暂未确认，可重试原请求。");
      }
    } finally {
      setSubmitBusy(false);
    }
  };
  confirmAction.current = submit;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!submitBusy) onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>生成本月账单</DialogTitle>
          <DialogDescription>租金与收费金额由服务端预览计算；额外费用可正可负。</DialogDescription>
        </DialogHeader>
        <form
          className="min-w-0 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setValidationAttempted(true);
            void form.handleSubmit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm" htmlFor="monthly-billing-month">
              <span>账单月份</span>
              <Input
                aria-label="账单月份"
                id="monthly-billing-month"
                type="month"
                value={draft.billingMonth}
                aria-invalid={Boolean(fieldError("billingMonth", draft.billingMonth))}
                aria-describedby={
                  fieldError("billingMonth", draft.billingMonth) ? "billing-month-error" : undefined
                }
                onChange={(event) => {
                  setTouched((current) => new Set(current).add("billingMonth"));
                  form.setFieldValue("billingMonth", event.target.value);
                  invalidatePreview();
                }}
              />
              {fieldError("billingMonth", draft.billingMonth) ? (
                <p id="billing-month-error" role="alert" className="text-destructive">
                  {fieldError("billingMonth", draft.billingMonth)}
                </p>
              ) : null}
            </label>
            <div className="space-y-1 text-sm">
              <span className="block">账单到期日</span>
              <DatePickerInput
                aria-label="账单到期日"
                value={draft.dueDate}
                aria-invalid={Boolean(fieldError("dueDate", draft.dueDate))}
                aria-describedby={
                  fieldError("dueDate", draft.dueDate) ? "bill-due-date-error" : undefined
                }
                onChange={(date) => {
                  setTouched((current) => new Set(current).add("dueDate"));
                  form.setFieldValue("dueDate", date ?? "");
                  invalidatePreview();
                }}
              />
              {fieldError("dueDate", draft.dueDate) ? (
                <p id="bill-due-date-error" role="alert" className="text-destructive">
                  {fieldError("dueDate", draft.dueDate)}
                </p>
              ) : null}
            </div>
          </div>
          {terms.isError || baseline.isError ? (
            <p role="alert">读取合同收费依据失败，请重试合同详情。</p>
          ) : terms.isPending || baseline.isPending ? (
            <p role="status">正在读取合同收费依据…</p>
          ) : (
            <section className="rounded-md border bg-muted/30 p-3 text-sm">
              <h3 className="font-medium">合同收费依据与入住底数</h3>
              <p className="tabular-nums">
                水费单价 CNY {terms.data.waterUnitPrice} / 立方米 · 电费单价 CNY{" "}
                {terms.data.electricityUnitPrice} / 度
              </p>
              {terms.data.fixedFees.map((fee) => (
                <p key={fee.id} className="tabular-nums">
                  {fee.name} CNY {(fee.monthlyAmountMinor / 100).toFixed(2)} / 月
                </p>
              ))}
              {baseline.data.readings.map((reading) => (
                <p key={reading.kind}>
                  入住{reading.kind === "water" ? "水表" : "电表"}底数 {reading.reading} ·{" "}
                  {reading.readingDate}
                </p>
              ))}
            </section>
          )}
          <p className="rounded-md border-l-2 pl-3 text-sm text-muted-foreground">
            租金由服务端按合同计算，本表不提供租金编辑入口。
          </p>
          <MeterReadingFields
            readings={draft.readings}
            onChange={setReading}
            errors={readingErrors}
            disabled={submitBusy}
          />
          <ExtraFeeFields
            fees={draft.extraFees}
            onChange={updateExtraFees}
            errorsById={extraFeeErrors}
            disabled={submitBusy}
          />
          {previewBusy ? <p role="status">正在按当前输入计算预览…</p> : null}
          {currentPreview ? (
            <section aria-label="服务端账单预览" className="space-y-2 rounded-lg border p-4">
              <h3 className="font-medium">服务端预览</h3>
              <p className="text-sm tabular-nums">
                服务端预览金额 CNY {formatBillAmount(currentPreview.amountMinor)}
              </p>
              {currentPreview.lines.map((line) => {
                const snapshot = line.feeSnapshot;
                if (!snapshot || !("startReading" in snapshot)) return null;
                return (
                  <p className="text-sm tabular-nums" key={`${line.sortOrder}:${line.kind}:start`}>
                    本期{snapshot.kind === "water" ? "水表" : "电表"}起始读数{" "}
                    {snapshot.startReading} · {snapshot.startDate}
                  </p>
                );
              })}
              {currentPreview.lines.map((line) => (
                <p className="text-sm" key={`${line.sortOrder}:${line.kind}`}>
                  {line.label} · {formatBillAmount(line.amountMinor)}
                  {line.note ? ` · ${line.note}` : ""}
                </p>
              ))}
              {currentPreview.missingFields.length ? (
                <p className="text-sm text-destructive">
                  尚缺：{currentPreview.missingFields.join("、")}
                </p>
              ) : null}
            </section>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitBusy}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewNonce((value) => value + 1)}
              disabled={!request || previewBusy || submitBusy}
            >
              重新预览
            </Button>
            <Button type="submit" disabled={!canConfirm}>
              {submitBusy ? "正在确认…" : "确认生成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
