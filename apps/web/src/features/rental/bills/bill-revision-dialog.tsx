import { useForm, useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalBillDetail, RentalBillRevisionPreview } from "@xpense/shared";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import {
  type AdjustRentalBillRequest,
  createRentalFinanceAttempt,
  type RentalFinanceApi,
} from "../../../services/rental-finance-api";
import { invalidateRentalFinance, rentalFinanceKeys } from "../../../services/rental-finance-query";
import { formatBillAmount } from "./bill-format";
import { BillRevisionChargeFields } from "./bill-revision-charge-fields";
import {
  type BillRevisionValues,
  billRevisionErrors,
  billRevisionFormSchema,
  initialBillRevisionValues,
  toBillRevisionInput,
} from "./bill-revision-form";
import { ExtraFeeFields } from "./extra-fee-fields";

type Props = {
  organizationId: string;
  bill: RentalBillDetail;
  api: RentalFinanceApi;
  billsApi: RentalBillsApi;
  permissions: readonly PermissionKey[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted: (preview: RentalBillRevisionPreview) => void;
};

function validationMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return undefined;
}

export function BillRevisionDialog(props: Props) {
  return props.open ? (
    <RevisionSession key={`${props.organizationId}:${props.bill.id}`} {...props} />
  ) : null;
}

function RevisionSession({
  organizationId,
  bill,
  api,
  billsApi,
  permissions,
  onOpenChange,
  onAdjusted,
}: Props) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<{
    fingerprint: string;
    data: RentalBillRevisionPreview;
  } | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const attempt = useRef<{ submit: () => Promise<RentalBillRevisionPreview> } | null>(null);
  const canRead = permissions.includes("rental_bills:read");
  const canAdjust = permissions.includes("rental_monthly_bills:adjust");
  const history = useQuery({
    queryKey: rentalFinanceKeys.billRevisions(organizationId, bill.contractId, bill.id, {
      page: 1,
      pageSize: 20,
    }),
    queryFn: () => billsApi.listRevisions({ billId: bill.id, page: 1, pageSize: 20 }),
    enabled: Boolean(canRead && organizationId && bill.id),
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const revisionSchema = useMemo(() => billRevisionFormSchema(bill), [bill]);
  const form = useForm({
    defaultValues: initialBillRevisionValues(bill),
    validators: { onChange: revisionSchema, onSubmit: revisionSchema },
    onSubmit: async ({ value }) => {
      const submittedInput = toBillRevisionInput(bill, value);
      const submittedFingerprint = submittedInput ? JSON.stringify(submittedInput) : "";
      const submittedPreview = preview?.fingerprint === submittedFingerprint ? preview.data : null;
      if (!submittedInput || !submittedPreview || submitBusy || !canAdjust) return;
      const payload: AdjustRentalBillRequest = {
        ...submittedInput,
        expectedVersion: submittedPreview.version,
        idempotencyKey: crypto.randomUUID(),
      };
      attempt.current ??= createRentalFinanceAttempt(api.adjustBill, payload);
      setSubmitBusy(true);
      setError(null);
      try {
        const result = await attempt.current.submit();
        if (!mounted.current) return;
        onAdjusted(result);
        void invalidateRentalFinance(queryClient, organizationId, bill.contractId);
        onOpenChange(false);
      } catch (cause) {
        if (!mounted.current) return;
        if (cause instanceof ApiError && cause.status === 409) {
          attempt.current = null;
          setPreview(null);
          setPreviewNonce((value) => value + 1);
          setError("账单来源已变化，请重新预览后确认。");
        } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
          attempt.current = null;
          setError(cause.status === 403 ? "缺少账单更正权限。" : cause.message);
        } else {
          setError("确认结果暂未确认，可重试原请求。");
        }
      } finally {
        if (mounted.current) setSubmitBusy(false);
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const errors = billRevisionErrors(bill, values);
  const feeErrors = new Map(
    values.extraFees.map((fee, index) => [
      fee.id,
      {
        name: errors.get(`extraFees.${index}.name`),
        amount: errors.get(`extraFees.${index}.amount`),
        note: errors.get(`extraFees.${index}.note`),
      },
    ]),
  );
  const input = useMemo(() => toBillRevisionInput(bill, values), [bill, values]);
  const fingerprint = input ? JSON.stringify(input) : "";
  const currentPreview = preview?.fingerprint === fingerprint ? preview.data : null;

  useEffect(() => {
    if (!input || !canAdjust) return;
    const controller = new AbortController();
    const currentSequence = ++sequence.current;
    setPreview(null);
    setPreviewBusy(true);
    setError(null);
    attempt.current = null;
    const timer = setTimeout(() => {
      void api
        .previewBillRevision(input, {
          signal: controller.signal,
          cancelKey: `bill-revision-preview:${organizationId}:${bill.id}:${previewNonce}`,
        })
        .then((data) => {
          if (!controller.signal.aborted && sequence.current === currentSequence)
            setPreview({ fingerprint, data });
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted && sequence.current === currentSequence) {
            setError(
              cause instanceof ApiError && cause.status === 409
                ? "账单来源已变化，请刷新后重试。"
                : "更正预览失败，请重试。",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && sequence.current === currentSequence)
            setPreviewBusy(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (sequence.current === currentSequence) sequence.current++;
    };
  }, [api, bill.id, canAdjust, fingerprint, input, organizationId, previewNonce]);

  const update = (next: BillRevisionValues) => {
    if (submitBusy) return;
    form.setFieldValue("meters", next.meters);
    form.setFieldValue("fixedFees", next.fixedFees);
    form.setFieldValue("extraFees", next.extraFees);
    form.setFieldValue("reason", next.reason);
    setPreview(null);
    setPreviewBusy(false);
    setError(null);
    attempt.current = null;
  };

  if (!canRead) return null;
  return (
    <Dialog open onOpenChange={(open) => !submitBusy && onOpenChange(open)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>账单更正与历史</DialogTitle>
          <DialogDescription>金额更正由服务端重算；租金不可在此编辑。</DialogDescription>
        </DialogHeader>
        {history.isPending ? <p role="status">正在读取修订历史…</p> : null}
        {history.isError ? (
          <div>
            <p role="alert">修订历史读取失败。</p>
            <Button variant="outline" onClick={() => void history.refetch()}>
              重试历史
            </Button>
          </div>
        ) : null}
        {history.data ? (
          <section className="space-y-2 rounded-md border p-3">
            <h3 className="font-medium">修订历史</h3>
            {history.data.items.length ? (
              history.data.items.map((revision) => (
                <article className="border-t pt-2 text-sm" key={revision.id}>
                  <p>
                    第 {revision.revision} 版 ·{" "}
                    {formatBillAmount(revision.amountMinor, bill.currencyCode)} ·{" "}
                    {revision.createdAt.slice(0, 10)}
                  </p>
                  <p className="break-words text-muted-foreground">{revision.reason}</p>
                  <ul className="space-y-1">
                    {revision.linesSnapshot.map((line) => (
                      <li key={`${line.sortOrder}:${line.kind}`}>
                        {line.label} · {formatBillAmount(line.amountMinor, bill.currencyCode)}
                        {line.note ? ` · ${line.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">暂无修订历史。</p>
            )}
          </section>
        ) : null}
        {canAdjust ? (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">
                租金由合同和服务端规则计算；调整完整额外费用清单，遗漏项目会被移除。
              </p>
              <div className="space-y-2">
                {values.extraFees.map((fee, index) => (
                  <p className="text-xs text-muted-foreground" key={fee.id}>
                    {fee.name || `额外费用 ${index + 1}`} ·{" "}
                    {fee.origin === "settlement" ? "结算来源" : "月度来源"}
                  </p>
                ))}
              </div>
              <BillRevisionChargeFields
                bill={bill}
                values={values}
                errors={errors}
                disabled={submitBusy}
                onChange={(next) => update({ ...values, ...next })}
              />
              <ExtraFeeFields
                fees={values.extraFees}
                errorsById={feeErrors}
                onChange={(fees) =>
                  update({
                    ...values,
                    extraFees: fees.map((fee) => ({
                      ...fee,
                      origin:
                        values.extraFees.find((current) => current.id === fee.id)?.origin ??
                        "monthly",
                    })),
                  })
                }
                disabled={submitBusy}
              />
              <form.Field name="reason">
                {(field) => {
                  const fieldError = field.state.meta.isTouched
                    ? validationMessage(field.state.meta.errors[0])
                    : undefined;
                  return (
                    <label className="block space-y-1 text-sm" htmlFor="bill-revision-reason">
                      <span>账单更正原因</span>
                      <Input
                        id="bill-revision-reason"
                        aria-label="账单更正原因"
                        value={field.state.value}
                        disabled={submitBusy}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={fieldError ? `${field.name}-error` : undefined}
                        onChange={(event) => {
                          field.handleChange(event.target.value);
                          setPreview(null);
                          setPreviewBusy(false);
                          setError(null);
                          attempt.current = null;
                        }}
                      />
                      {fieldError ? (
                        <p id={`${field.name}-error`} role="alert" className="text-destructive">
                          {fieldError}
                        </p>
                      ) : null}
                    </label>
                  );
                }}
              </form.Field>
              {previewBusy ? <p role="status">正在预览账单更正…</p> : null}
              {currentPreview ? (
                <section className="space-y-1 rounded-md border p-3 text-sm">
                  <h3 className="font-medium">服务端更正预览</h3>
                  {currentPreview.affectedBills.map((affected) => (
                    <p className="tabular-nums" key={affected.billId}>
                      应收 {formatBillAmount(affected.beforeAmountMinor, bill.currencyCode)} →{" "}
                      {formatBillAmount(affected.afterAmountMinor, bill.currencyCode)}
                    </p>
                  ))}
                  {currentPreview.settlementDifferenceMinor !== null ? (
                    <p className="tabular-nums">
                      结算差额{" "}
                      {formatBillAmount(
                        currentPreview.settlementDifferenceMinor,
                        bill.currencyCode,
                      )}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </section>
            {error ? <p role="alert">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitBusy}
              >
                关闭
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewNonce((value) => value + 1)}
                disabled={!input || previewBusy || submitBusy}
              >
                重新预览
              </Button>
              <div className="flex gap-2">
                <button className="sr-only" type="submit" tabIndex={-1} aria-hidden="true">
                  提交
                </button>
                <Button
                  type="submit"
                  disabled={!currentPreview?.affectedBills.length || previewBusy || submitBusy}
                >
                  {submitBusy ? "正在确认…" : "确认更正"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
