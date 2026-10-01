import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalBillDetail, RentalCashEntry } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { DatePickerInput } from "@/components/date-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { invalidateRentalFinance } from "../../../services/rental-finance-query";
import { isCalendarDate } from "../contracts/contract-action-model";
import { formatBillAmount } from "./bill-format";
import { parseSignedMoneyMinor } from "./monthly-bill-form";

type Props = {
  organizationId: string;
  bill: RentalBillDetail;
  api: RentalFinanceApi;
  permissions: readonly PermissionKey[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (entry: RentalCashEntry) => void;
};

type Intent = "receipt" | "deposit" | "refund";

function validationMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return undefined;
}

export function BillReceiptDialog(props: Props) {
  return props.open ? (
    <ReceiptSession key={`${props.organizationId}:${props.bill.id}`} {...props} />
  ) : null;
}

function ReceiptSession({
  organizationId,
  bill,
  api,
  permissions,
  onOpenChange,
  onUpdated,
}: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [refundConfirm, setRefundConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receiptAttempt = useRef<{ submit: () => Promise<RentalCashEntry> } | null>(null);
  const depositAttempt = useRef<{ submit: () => Promise<RentalCashEntry> } | null>(null);
  const refundAttempt = useRef<{ submit: () => Promise<RentalCashEntry> } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const balance = bill.modelVersion === 2 ? bill.financial : undefined;
  const isInSettlement = Boolean(bill.settlementId);
  const defaultIntent: Intent = bill.type === "deposit" ? "deposit" : "receipt";
  const canRecordPartial = Boolean(
    !isInSettlement &&
      bill.type !== "deposit" &&
      permissions.includes("rental_receipts:create") &&
      balance?.outstandingMinor,
  );
  const canConfirmDeposit = Boolean(
    !isInSettlement &&
      bill.type === "deposit" &&
      permissions.includes("rental_receipts:create") &&
      balance?.outstandingMinor,
  );
  const canRefund = Boolean(
    !isInSettlement &&
      permissions.includes("rental_refunds:create") &&
      balance?.refundableMinor &&
      balance.refundableMinor > 0,
  );
  const commonValues = {
    occurredOn: z
      .string()
      .refine((value) => !value || isCalendarDate(value), "请输入有效发生日期。")
      .min(1, "请选择发生日期。"),
    note: z.string(),
  };
  const receiptFormSchema = z.discriminatedUnion("intent", [
    z.object({
      intent: z.literal("receipt"),
      ...commonValues,
      amount: z.string().refine((value) => {
        const amountMinor = parseSignedMoneyMinor(value);
        return (
          amountMinor !== null && amountMinor > 0 && amountMinor <= (balance?.outstandingMinor ?? 0)
        );
      }, "请输入不超过待收金额的有效收款金额。"),
    }),
    z.object({ intent: z.literal("deposit"), ...commonValues, amount: z.string() }),
    z.object({ intent: z.literal("refund"), ...commonValues, amount: z.string() }),
  ]);
  const form = useForm({
    defaultValues: { intent: defaultIntent as Intent, amount: "", occurredOn: "", note: "" },
    validators: { onChange: receiptFormSchema, onSubmit: receiptFormSchema },
    onSubmit: async ({ value }) => {
      if (value.intent === "receipt") {
        if (!canRecordPartial || !balance) return;
        const amountMinor = parseSignedMoneyMinor(value.amount);
        if (amountMinor === null) return;
        const payload = {
          target: { kind: "bill" as const, billId: bill.id },
          amountMinor,
          occurredOn: value.occurredOn,
          ...(value.note.trim() ? { note: value.note.trim() } : {}),
          expectedVersion: balance.version,
          idempotencyKey: crypto.randomUUID(),
        };
        const currentAttempt =
          receiptAttempt.current ?? createRentalFinanceAttempt(api.recordReceipt, payload);
        receiptAttempt.current = currentAttempt;
        await run(currentAttempt.submit);
      } else if (value.intent === "deposit") {
        if (!canConfirmDeposit || !balance) return;
        const payload = {
          billId: bill.id,
          occurredOn: value.occurredOn,
          ...(value.note.trim() ? { note: value.note.trim() } : {}),
          expectedVersion: balance.version,
          idempotencyKey: crypto.randomUUID(),
        };
        const currentAttempt =
          depositAttempt.current ?? createRentalFinanceAttempt(api.confirmDepositReceipt, payload);
        depositAttempt.current = currentAttempt;
        await run(currentAttempt.submit);
      } else {
        if (!canRefund || !balance) return;
        const payload = {
          target: bill.settlementId
            ? { kind: "settlement" as const, settlementId: bill.settlementId }
            : { kind: "bill" as const, billId: bill.id },
          occurredOn: value.occurredOn,
          ...(value.note.trim() ? { note: value.note.trim() } : {}),
          expectedVersion: balance.version,
          idempotencyKey: crypto.randomUUID(),
        };
        const currentAttempt =
          refundAttempt.current ?? createRentalFinanceAttempt(api.confirmRefund, payload);
        refundAttempt.current = currentAttempt;
        setRefundConfirm(false);
        await run(currentAttempt.submit);
      }
    },
  });
  const handleFailure = (cause: unknown) => {
    if (!mounted.current) return;
    if (cause instanceof ApiError && cause.status === 409) {
      receiptAttempt.current = null;
      depositAttempt.current = null;
      refundAttempt.current = null;
      setError("收退款余额已变化，请刷新账单后重试。");
    } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
      setError(cause.status === 403 ? "缺少当前收退款操作权限。" : cause.message);
    } else {
      setError("操作结果暂未确认，可重试原请求。");
    }
  };

  const run = async (submit: () => Promise<RentalCashEntry>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry = await submit();
      if (!mounted.current) return;
      onUpdated(entry);
      void invalidateRentalFinance(queryClient, organizationId, bill.contractId);
      onOpenChange(false);
    } catch (cause) {
      handleFailure(cause);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const resetPartialAttempt = () => {
    receiptAttempt.current = null;
    form.setFieldValue("intent", defaultIntent);
    setError(null);
  };
  const resetDepositAttempt = () => {
    depositAttempt.current = null;
    refundAttempt.current = null;
    form.setFieldValue("intent", defaultIntent);
    setError(null);
  };
  const submitIntent = (intent: Intent) => {
    form.setFieldValue("intent", intent);
    void form.handleSubmit();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>登记账单收退款</DialogTitle>
            <DialogDescription>
              {bill.billNumber} · {formatBillAmount(bill.amountMinor, bill.currencyCode)}
            </DialogDescription>
          </DialogHeader>
          {isInSettlement ? (
            <p className="rounded-md border bg-muted/40 p-3 text-sm">
              已纳入退租结算，收退款请在结算记录中处理。
            </p>
          ) : balance ? (
            <form
              noValidate
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                form.setFieldValue("intent", defaultIntent);
                void form.handleSubmit();
              }}
            >
              <p className="text-sm tabular-nums">
                已收 {formatBillAmount(balance.receivedMinor, bill.currencyCode)} · 待收{" "}
                {formatBillAmount(balance.outstandingMinor, bill.currencyCode)} · 可退{" "}
                {formatBillAmount(balance.refundableMinor, bill.currencyCode)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <form.Field name="occurredOn">
                  {(field) => {
                    const fieldError = field.state.meta.isTouched
                      ? validationMessage(field.state.meta.errors[0])
                      : undefined;
                    return (
                      <div className="space-y-1 text-sm">
                        <span className="block">发生日期</span>
                        <DatePickerInput
                          aria-label="收款日期"
                          aria-invalid={Boolean(fieldError)}
                          aria-describedby={fieldError ? `${field.name}-error` : undefined}
                          value={field.state.value}
                          onChange={(date) => {
                            field.handleChange(date ?? "");
                            resetPartialAttempt();
                            resetDepositAttempt();
                          }}
                        />
                        {fieldError ? (
                          <p id={`${field.name}-error`} role="alert" className="text-destructive">
                            {fieldError}
                          </p>
                        ) : null}
                      </div>
                    );
                  }}
                </form.Field>
                {bill.type !== "deposit" ? (
                  <form.Field name="amount">
                    {(field) => {
                      const fieldError = field.state.meta.isTouched
                        ? validationMessage(field.state.meta.errors[0])
                        : undefined;
                      return (
                        <label className="space-y-1 text-sm" htmlFor="receipt-amount">
                          <span>本次收款金额（元）</span>
                          <Input
                            aria-label="本次收款金额（元）"
                            id="receipt-amount"
                            inputMode="decimal"
                            value={field.state.value}
                            aria-invalid={Boolean(fieldError)}
                            aria-describedby={fieldError ? `${field.name}-error` : undefined}
                            onChange={(event) => {
                              field.handleChange(event.target.value);
                              resetPartialAttempt();
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
                ) : null}
              </div>
              <form.Field name="note">
                {(field) => (
                  <label className="block space-y-1 text-sm" htmlFor="receipt-note">
                    <span>备注</span>
                    <Input
                      id="receipt-note"
                      value={field.state.value}
                      onChange={(event) => {
                        field.handleChange(event.target.value);
                        resetPartialAttempt();
                        resetDepositAttempt();
                      }}
                    />
                  </label>
                )}
              </form.Field>
              {error ? <p role="alert">{error}</p> : null}
              <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {bill.type === "deposit" && balance.outstandingMinor > 0 ? (
                    <Button
                      type="button"
                      disabled={!canConfirmDeposit || busy}
                      onClick={() => submitIntent("deposit")}
                    >
                      确认押金全额收款
                    </Button>
                  ) : null}
                  {bill.type !== "deposit" && balance.outstandingMinor > 0 ? (
                    <Button
                      type="button"
                      disabled={!canRecordPartial || busy}
                      onClick={() => submitIntent("receipt")}
                    >
                      登记本次收款
                    </Button>
                  ) : null}
                  {balance.refundableMinor > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canRefund || busy}
                      onClick={() => setRefundConfirm(true)}
                    >
                      确认全额退款
                    </Button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button className="sr-only" type="submit" tabIndex={-1} aria-hidden="true">
                    提交
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={busy}
                  >
                    关闭
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">此账单没有可用的 v2 收退款余额。</p>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={refundConfirm} onOpenChange={setRefundConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认全额退款</AlertDialogTitle>
            <AlertDialogDescription>
              将全额退还当前可退款金额{" "}
              {formatBillAmount(balance?.refundableMinor ?? 0, bill.currencyCode)}
              ，请确认到账日期和备注无误。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回</AlertDialogCancel>
            <AlertDialogAction disabled={!canRefund || busy} onClick={() => submitIntent("refund")}>
              二次确认退款
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
