import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import type {
  GenerateRentalPeriodBillRequest,
  RentalBillDetail,
  RentalPeriodBillContext,
  RentalPeriodBillPreview,
} from "@xpense/shared";
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
import { ApiError } from "../../../services/api-client";
import {
  createRentalFinanceAttempt,
  type RentalFinanceApi,
} from "../../../services/rental-finance-api";
import { rentalFinanceKeys } from "../../../services/rental-finance-query";
import { PeriodBillFields } from "./period-bill-fields";
import {
  createPeriodBillDraft,
  createPeriodBillDraftSchema,
  type PeriodBillDraft,
  toPeriodBillPreviewRequest,
} from "./period-bill-form";
import { PeriodBillPreview } from "./period-bill-preview";
export type PeriodBillDialogProps = {
  organizationId: string;
  contractId: string;
  api: RentalFinanceApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (bill: RentalBillDetail) => void;
};
export function PeriodBillSession({
  organizationId,
  contractId,
  api,
  onOpenChange,
  onGenerated,
  context,
}: PeriodBillDialogProps & { context: RentalPeriodBillContext }) {
  const [page, setPage] = useState(1);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [preview, setPreview] = useState<{
    fingerprint: string;
    data: RentalPeriodBillPreview;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const submitAction = useRef<() => Promise<void>>(async () => {});
  const attempt = useRef<ReturnType<
    typeof createRentalFinanceAttempt<GenerateRentalPeriodBillRequest, RentalBillDetail>
  > | null>(null);
  const form = useForm({
    defaultValues: createPeriodBillDraft(context),
    validators: { onChange: createPeriodBillDraftSchema(context.defaults) },
    onSubmit: async () => submitAction.current(),
  });
  const draft = useStore(form.store, (state) => state.values);
  const periods = useQuery({
    queryKey: rentalFinanceKeys.periodBillContext(organizationId, contractId, page, 20),
    queryFn: ({ signal }) =>
      api.getPeriodBillContext({ contractId, page, pageSize: 20 }, { signal }),
    enabled: page !== 1,
    retry: false,
  });
  const continuation =
    context.canSelectBillingStart && draft.periodStart !== context.nextPeriod?.periodStart;
  const schema = useMemo(
    () => createPeriodBillDraftSchema(context.defaults, continuation),
    [context.defaults, continuation],
  );
  const validation = schema.safeParse(draft);
  const errors = new Map<string, string>();
  if (!validation.success)
    for (const issue of validation.error.issues) {
      const path = issue.path.join(".");
      if (
        attempted ||
        touched.has(String(issue.path[0])) ||
        (issue.path[0] === "overrideReason" &&
          ["overrideWaterUnitPrice", "overrideElectricityUnitPrice", "overrideFixedFees"].some(
            (key) => touched.has(key),
          ))
      )
        errors.set(path, issue.message);
    }
  const request = useMemo(() => {
    const value = toPeriodBillPreviewRequest(contractId, draft, context.defaults, continuation);
    if (!value) return null;
    return continuation
      ? {
          ...value,
          billingStart: {
            firstPeriodStart: draft.periodStart,
            baselineReadings: (["water", "electricity"] as const)
              .filter((kind) => context.defaults[`${kind}CollectionEnabled`])
              .map((kind) => ({ kind, ...draft.baselineReadings[kind] })),
          },
        }
      : value;
  }, [contractId, draft, context.defaults, continuation]);
  const fingerprint = request ? JSON.stringify(request) : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce 是用户刷新与冲突恢复的显式触发器。
  useEffect(() => {
    const current = ++sequence.current;
    const controller = new AbortController();
    setPreview(null);
    attempt.current = null;
    setPreviewBusy(Boolean(request));
    if (!request) return;
    const timer = setTimeout(() => {
      void api
        .previewPeriodBill(request, {
          signal: controller.signal,
          cancelKey: `period-preview:${organizationId}:${contractId}`,
        })
        .then((data) => {
          if (!controller.signal.aborted && sequence.current === current)
            setPreview({ fingerprint, data });
        })
        .catch((cause) => {
          if (!controller.signal.aborted && sequence.current === current)
            setError(
              cause instanceof ApiError && cause.status === 409
                ? "账期依据已变化，请关闭窗口重新读取。"
                : "账期预览失败，请重试。",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted && sequence.current === current) setPreviewBusy(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (sequence.current === current) sequence.current++;
    };
  }, [api, request, fingerprint, nonce, organizationId, contractId]);
  const currentPreview = preview?.fingerprint === fingerprint ? preview.data : null;
  const canConfirm = Boolean(
    validation.success && request && currentPreview?.canConfirm && !previewBusy && !busy,
  );
  const update = <K extends keyof PeriodBillDraft>(key: K, value: PeriodBillDraft[K]) => {
    sequence.current++;
    setPreview(null);
    setPreviewBusy(false);
    setError(null);
    attempt.current = null;
    if (key === "periodStart" && !touched.has("dueDate"))
      form.setFieldValue("dueDate", String(value));
    if (key === "baselineReadings" && !touched.has("readings"))
      form.setFieldValue("readings", value as PeriodBillDraft["readings"]);
    form.setFieldValue(key, value as never);
    setTouched((current) => new Set(current).add(key));
  };
  submitAction.current = async () => {
    if (!canConfirm || !request || !currentPreview || !request.dueDate || !request.readings) return;
    setBusy(true);
    setError(null);
    attempt.current ??= createRentalFinanceAttempt(api.generatePeriodBill, {
      ...request,
      dueDate: request.dueDate,
      readings: request.readings,
      expectedVersion: currentPreview.version,
      idempotencyKey: crypto.randomUUID(),
    });
    try {
      const bill = await attempt.current.submit();
      onGenerated(bill);
      onOpenChange(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        attempt.current = null;
        setPreview(null);
        setNonce((value) => value + 1);
        setError("账期或收费依据已变化，请重新预览；不会自动确认下一期。");
      } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
        attempt.current = null;
        setError(cause.status === 403 ? "缺少账期出账权限。" : cause.message);
      } else setError("确认结果暂未确认，可重试原请求。");
    } finally {
      setBusy(false);
    }
  };
  const displayedContext =
    page === 1
      ? context
      : {
          ...context,
          selectablePeriods: periods.data?.selectablePeriods ?? {
            items: [],
            page,
            pageSize: 20,
            total: context.selectablePeriods.total,
          },
        };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-6">
          <DialogTitle>生成下一张账单</DialogTitle>
          <DialogDescription>确认后保存本期收费及读数快照。</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            void form.handleSubmit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <PeriodBillFields
              draft={draft}
              context={displayedContext}
              preview={currentPreview}
              previewBusy={previewBusy}
              errors={errors}
              disabled={busy}
              page={page}
              onPage={setPage}
              onChange={update}
            />
            {periods.isFetching ? <p role="status">正在读取候选账期…</p> : null}
            {periods.isError ? <p role="alert">候选账期读取失败，请重试。</p> : null}
            {previewBusy ? <p role="status">正在计算账单预览…</p> : null}
            {currentPreview ? <PeriodBillPreview preview={currentPreview} /> : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 border-t px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !request}
              onClick={() => {
                setPreview(null);
                setNonce((value) => value + 1);
              }}
            >
              重新预览
            </Button>
            <Button type="submit" disabled={!canConfirm}>
              {busy ? "正在确认…" : "确认生成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
