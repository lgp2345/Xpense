import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalSettlementDetail } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
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
import { ApiError } from "../../../services/api-client";
import {
  createRentalFinanceAttempt,
  type RentalFinanceApi,
} from "../../../services/rental-finance-api";
import { invalidateRentalFinance } from "../../../services/rental-finance-query";
import { formatBillAmount } from "../bills/bill-format";
import { parseSignedMoneyMinor } from "../bills/monthly-bill-form";
import { SettlementCashHistory } from "./settlement-history";
import { DateField, MoneyField, TextField } from "./settlement-preview";

type RefundAttempt = { submit: () => Promise<unknown>; amountMinor: number; occurredOn: string };

function today(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find(({ type }) => type === "year")?.value}-${parts.find(({ type }) => type === "month")?.value}-${parts.find(({ type }) => type === "day")?.value}`;
}

function errorMessage(error: unknown, action: string): { message: string; retry: boolean } {
  if (error instanceof ApiError && error.status === 409)
    return { message: "结算资金余额已变化，请刷新后重试。", retry: false };
  if (error instanceof ApiError && error.status > 0 && error.status < 500)
    return { message: error.status === 403 ? `缺少${action}权限。` : error.message, retry: false };
  return { message: `操作结果暂未确认，可重试${action}。`, retry: true };
}

export function SettlementCashActions({
  organizationId,
  settlement,
  api,
  permissions,
}: {
  organizationId: string;
  settlement: RentalSettlementDetail;
  api: RentalFinanceApi;
  permissions: readonly PermissionKey[];
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receiptAttempt = useRef<{ submit: () => Promise<unknown> } | null>(null);
  const refundAttempt = useRef<RefundAttempt | null>(null);
  const [refundConfirmation, setRefundConfirmation] = useState<RefundAttempt | null>(null);
  const mounted = useRef(true);
  const contextKey = `${organizationId}:${settlement.contractId}:${settlement.id}`;
  const liveContext = useRef(contextKey);
  liveContext.current = contextKey;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const receiptForm = useForm({
    defaultValues: { amount: "", occurredOn: today(), note: "" },
    validators: {
      onSubmit: z.object({
        amount: z.string().refine((value) => {
          const amount = parseSignedMoneyMinor(value);
          return amount !== null && amount > 0 && amount <= settlement.balance.outstandingMinor;
        }, "请输入不超过待补款金额的有效金额。"),
        occurredOn: z.string().min(1, "请选择收款日期。"),
        note: z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      const amountMinor = parseSignedMoneyMinor(value.amount);
      if (!amountMinor || !permissions.includes("rental_receipts:create")) return;
      const input = {
        target: { kind: "settlement" as const, settlementId: settlement.id },
        amountMinor,
        occurredOn: value.occurredOn,
        ...(value.note.trim() ? { note: value.note.trim() } : {}),
        expectedVersion: settlement.balance.version,
        idempotencyKey: crypto.randomUUID(),
      };
      receiptAttempt.current ??= createRentalFinanceAttempt(api.recordReceipt, input);
      await run(receiptAttempt.current.submit, "登记补款", receiptAttempt);
    },
  });

  const refundForm = useForm({
    defaultValues: { occurredOn: today(), note: "" },
    validators: {
      onSubmit: z.object({ occurredOn: z.string().min(1, "请选择退款日期。"), note: z.string() }),
    },
    onSubmit: async ({ value }) => {
      if (!settlement.balance.refundableMinor || !permissions.includes("rental_refunds:create"))
        return;
      const input = {
        target: { kind: "settlement" as const, settlementId: settlement.id },
        occurredOn: value.occurredOn,
        ...(value.note.trim() ? { note: value.note.trim() } : {}),
        expectedVersion: settlement.balance.version,
        idempotencyKey: crypto.randomUUID(),
      };
      refundAttempt.current ??= {
        ...createRentalFinanceAttempt(api.confirmRefund, input),
        amountMinor: settlement.balance.refundableMinor,
        occurredOn: value.occurredOn,
      };
      setRefundConfirmation(refundAttempt.current);
    },
  });

  const run = async (
    submit: () => Promise<unknown>,
    action: string,
    attempt: { current: { submit: () => Promise<unknown> } | null },
  ) => {
    if (busy) return;
    const capturedContext = contextKey;
    setBusy(true);
    setError(null);
    try {
      await submit();
      if (!mounted.current || liveContext.current !== capturedContext) return;
      attempt.current = null;
      receiptForm.reset();
      refundForm.reset();
      void invalidateRentalFinance(queryClient, organizationId, settlement.contractId);
    } catch (cause) {
      if (!mounted.current || liveContext.current !== capturedContext) return;
      const result = errorMessage(cause, action);
      if (!result.retry) attempt.current = null;
      setError(result.message);
    } finally {
      if (mounted.current && liveContext.current === capturedContext) setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="结算资金">
      <h2 className="font-semibold">登记实际收退款</h2>
      {settlement.balance.outstandingMinor > 0 && permissions.includes("rental_receipts:create") ? (
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void receiptForm.handleSubmit();
          }}
        >
          <receiptForm.Field name="amount">
            {(field) => (
              <MoneyField
                label="本次补款金额（元）"
                value={field.state.value}
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
                onChange={(value) => {
                  field.handleChange(value);
                  receiptAttempt.current = null;
                }}
              />
            )}
          </receiptForm.Field>
          <receiptForm.Field name="occurredOn">
            {(field) => (
              <DateField
                label="收款日期"
                value={field.state.value}
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
                onChange={(value) => {
                  field.handleChange(value);
                  receiptAttempt.current = null;
                }}
              />
            )}
          </receiptForm.Field>
          <receiptForm.Field name="note">
            {(field) => (
              <TextField
                label="补款备注"
                value={field.state.value}
                onChange={(value) => {
                  field.handleChange(value);
                  receiptAttempt.current = null;
                }}
              />
            )}
          </receiptForm.Field>
          <Button className="self-end" type="submit" disabled={busy}>
            登记补款
          </Button>
        </form>
      ) : null}
      {settlement.balance.refundableMinor > 0 && permissions.includes("rental_refunds:create") ? (
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void refundForm.handleSubmit();
          }}
        >
          <refundForm.Field name="occurredOn">
            {(field) => (
              <DateField
                label="退款日期"
                value={field.state.value}
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
                onChange={(value) => {
                  field.handleChange(value);
                  refundAttempt.current = null;
                }}
              />
            )}
          </refundForm.Field>
          <refundForm.Field name="note">
            {(field) => (
              <TextField
                label="退款备注"
                value={field.state.value}
                onChange={(value) => {
                  field.handleChange(value);
                  refundAttempt.current = null;
                }}
              />
            )}
          </refundForm.Field>
          <Button type="submit" disabled={busy}>
            确认已退 ¥{formatBillAmount(settlement.balance.refundableMinor)}
          </Button>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <AlertDialog
        open={Boolean(refundConfirmation)}
        onOpenChange={(open) => {
          if (!open) setRefundConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认全额退款</AlertDialogTitle>
            <AlertDialogDescription>
              请确认已向当前合同的租客退还 ¥{formatBillAmount(refundConfirmation?.amountMinor ?? 0)}
              ，退款日期为 {refundConfirmation?.occurredOn}。确认后将登记这笔退款。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                if (!refundConfirmation || !permissions.includes("rental_refunds:create")) return;
                const captured = refundConfirmation;
                setRefundConfirmation(null);
                void run(captured.submit, "确认退款", refundAttempt);
              }}
            >
              确认登记退款
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SettlementCashHistory
        organizationId={organizationId}
        settlement={settlement}
        api={api}
        permissions={permissions}
      />
    </section>
  );
}
