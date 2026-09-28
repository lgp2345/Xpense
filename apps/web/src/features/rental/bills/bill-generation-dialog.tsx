import { useForm, useStore } from "@tanstack/react-form";
import type { RentalBillGenerationResult, RentalBillPreview } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
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
import { ApiError } from "../../../services/api-client";
import {
  createRentalBillGenerationAttempt,
  type RentalBillsApi,
} from "../../../services/rental-bills-api";
import { formatBillAmount as formatMoney } from "./bill-format";
import {
  type BillGenerationValues,
  billGenerationFormSchema,
  parseTerminationAmount,
} from "./bill-generation-form";
import { BillPreviewTable } from "./bill-preview-table";
import { TerminationBillingFields } from "./termination-billing-fields";

type Props = {
  organizationId: string;
  contractId: string;
  api: RentalBillsApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (result: RentalBillGenerationResult) => void;
};
export function BillGenerationDialog(props: Props) {
  return props.open ? (
    <GenerationSession key={`${props.organizationId}:${props.contractId}`} {...props} />
  ) : null;
}
function GenerationSession({ contractId, api, onOpenChange, onGenerated }: Props) {
  const form = useForm({
    defaultValues: {
      depositDueDates: {},
      unifiedDate: "",
      amountText: "",
      reason: "",
    } as BillGenerationValues,
    validators: { onChange: billGenerationFormSchema },
  });
  const values = useStore(form.store, (state) => state.values);
  const [preview, setPreview] = useState<RentalBillPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [valid, setValid] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const attempt = useRef<ReturnType<typeof createRentalBillGenerationAttempt> | null>(null);
  const requestSequence = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSequence.current++;
    };
  }, []);
  const confirmation = () => {
    const amount = parseTerminationAmount(form.state.values.amountText);
    return amount !== null && form.state.values.reason.trim()
      ? { finalAmountMinor: amount, reason: form.state.values.reason.trim() }
      : undefined;
  };
  const refresh = async (page = 1) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setValid(false);
    setError(null);
    attempt.current = null;
    const sequence = ++requestSequence.current;
    try {
      const input = {
        contractId,
        depositDueDates: form.state.values.depositDueDates,
        ...(confirmation() ? { terminationConfirmation: confirmation() } : {}),
        page,
        pageSize: 20,
      };
      let result: RentalBillPreview;
      if (page > 1) {
        result = await api.previewBills({ ...input, expectedVersion: preview?.version });
      } else {
        const base = await api.previewBills({ ...input, depositDueDates: {} });
        const dates = Object.fromEntries(
          base.missingDepositSourceKeys
            .filter((key) => input.depositDueDates[key])
            .map((key) => [key, input.depositDueDates[key] as string]),
        );
        result = Object.keys(dates).length
          ? await api.previewBills({ ...input, depositDueDates: dates })
          : base;
        if (mounted.current && sequence === requestSequence.current)
          form.setFieldValue("depositDueDates", dates);
      }
      if (mounted.current && sequence === requestSequence.current) {
        setPreview(result);
        setValid(true);
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof ApiError && cause.status === 409
            ? "账单已变化，请重新预览。"
            : "预览失败，请重试。",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  // 初次打开只读预览；组织/合同 key 变化创建新的会话并丢弃旧响应。
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed 会话固定 contractId 与 api，避免编辑字段触发请求。
  useEffect(() => {
    void refresh();
  }, []);
  const change = () => {
    setValid(false);
    attempt.current = null;
    setError(null);
  };
  const submit = async () => {
    if (inFlight.current || !preview || !valid || !preview.canGenerate) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    attempt.current ??= createRentalBillGenerationAttempt(api, {
      contractId,
      depositDueDates: form.state.values.depositDueDates,
      expectedVersion: preview.version,
      ...(confirmation() ? { terminationConfirmation: confirmation() } : {}),
    });
    try {
      const result = await attempt.current.submit();
      if (mounted.current) {
        onGenerated(result);
        onOpenChange(false);
      }
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof ApiError && cause.status === 409) {
          setValid(false);
          attempt.current = null;
          form.setFieldValue("amountText", "");
          form.setFieldValue("reason", "");
          setError("账单已变化，请重新预览。");
        } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
          setValid(false);
          attempt.current = null;
          setError(cause.status === 403 ? "缺少生成或终止财务调整权限。" : cause.message);
        } else setError("生成结果暂未确认，可重试原请求。");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>预览并生成合同应收</DialogTitle>
          <DialogDescription>本阶段仅记录应收，收款情况尚未登记</DialogDescription>
        </DialogHeader>
        {busy && !preview ? <p role="status">正在读取完整计费计划…</p> : null}
        {preview ? (
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <p>金额单位：组织本位币</p>
              <p>
                新增 {preview.createCount} 张 · 已存在 {preview.existingCount} 张
              </p>
              <p className="tabular-nums">
                本次新增租金 {formatMoney(preview.createTotals.rentAmountMinor)} · 押金{" "}
                {formatMoney(preview.createTotals.depositAmountMinor)}
              </p>
              <p className="text-xs text-muted-foreground">
                金额为整个计划的汇总，分页仅影响展示。正常租金、既有金额及到期日均只读。
              </p>
            </div>
            {preview.missingDepositSourceKeys.length ? (
              <fieldset disabled={busy} className="space-y-3">
                <legend className="text-sm font-medium">新增押金到期日（必填）</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <DatePickerInput
                    aria-label="统一押金到期日"
                    value={values.unifiedDate}
                    onChange={(date) => form.setFieldValue("unifiedDate", date ?? "")}
                  />
                  <Button
                    variant="outline"
                    disabled={!values.unifiedDate || busy}
                    onClick={() => {
                      form.setFieldValue(
                        "depositDueDates",
                        Object.fromEntries(
                          preview.missingDepositSourceKeys.map((key) => [key, values.unifiedDate]),
                        ),
                      );
                      change();
                    }}
                  >
                    应用到新增押金
                  </Button>
                </div>
                {preview.missingDepositSourceKeys.map((key, index) => (
                  <div className="space-y-1" key={key}>
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor={`deposit-date-${index}`}
                    >
                      押金 {index + 1} 到期日
                    </label>
                    <DatePickerInput
                      id={`deposit-date-${index}`}
                      aria-label={`押金 ${index + 1} 到期日`}
                      value={values.depositDueDates[key]}
                      onChange={(date) => {
                        const dates = { ...values.depositDueDates };
                        if (date) dates[key] = date;
                        else delete dates[key];
                        form.setFieldValue("depositDueDates", dates);
                        change();
                      }}
                    />
                  </div>
                ))}
              </fieldset>
            ) : null}
            {preview.terminationReference ? (
              <TerminationBillingFields
                preview={preview.terminationReference}
                amountText={values.amountText}
                reason={values.reason}
                disabled={busy}
                onAmountChange={(value) => {
                  form.setFieldValue("amountText", value);
                  change();
                }}
                onReasonChange={(value) => {
                  form.setFieldValue("reason", value);
                  change();
                }}
              />
            ) : null}
            <BillPreviewTable
              preview={preview}
              disabled={busy || !valid}
              onPageChange={(page) => void refresh(page)}
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            更新预览
          </Button>
          <Button
            disabled={busy || !valid || !preview?.canGenerate || preview.createCount === 0}
            onClick={() => void submit()}
          >
            {busy ? "处理中…" : attempt.current ? "重试原请求" : "确认生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
