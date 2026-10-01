import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalBillDetail, RentalCashEntry } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
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
import { invalidateRentalFinance, rentalFinanceKeys } from "../../../services/rental-finance-query";
import { formatBillAmount } from "./bill-format";

const revokeFormSchema = z.object({
  reason: z.string().trim().min(1, "请填写撤销原因。"),
});

function validationMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return undefined;
}

export function BillCashHistory({
  organizationId,
  bill,
  api,
  permissions,
}: {
  organizationId: string;
  bill: RentalBillDetail;
  api: RentalFinanceApi;
  permissions: readonly PermissionKey[];
}) {
  const target = { kind: "bill" as const, billId: bill.id };
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: rentalFinanceKeys.billCash(organizationId, bill.contractId, bill.id, {
      page: 1,
      pageSize: 20,
    }),
    queryFn: ({ signal }) => api.listCash({ target, page: 1, pageSize: 20 }, { signal }),
    enabled: Boolean(
      organizationId && bill.modelVersion === 2 && permissions.includes("rental_bills:read"),
    ),
  });
  const [entryToRevoke, setEntryToRevoke] = useState<RentalCashEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ submit: () => Promise<RentalCashEntry> } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onChange: revokeFormSchema, onSubmit: revokeFormSchema },
    onSubmit: async ({ value }) => {
      if (!entryToRevoke || !bill.financial || busy) return;
      const isReceipt = entryToRevoke.kind === "receipt";
      if (!permissions.includes(isReceipt ? "rental_receipts:revoke" : "rental_refunds:revoke"))
        return;
      const input = {
        entryId: entryToRevoke.id,
        reason: value.reason.trim(),
        expectedVersion: bill.financial.version,
        idempotencyKey: crypto.randomUUID(),
      };
      attempt.current ??= createRentalFinanceAttempt(
        isReceipt ? api.revokeReceipt : api.revokeRefund,
        input,
      );
      setBusy(true);
      setError(null);
      try {
        await attempt.current.submit();
        if (!mounted.current) return;
        setEntryToRevoke(null);
        form.reset();
        attempt.current = null;
        void invalidateRentalFinance(queryClient, organizationId, bill.contractId);
      } catch (cause) {
        if (!mounted.current) return;
        if (cause instanceof ApiError && cause.status === 409) {
          attempt.current = null;
          setError("收退款余额已变化，请刷新后重试。");
        } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
          attempt.current = null;
          setError(cause.status === 403 ? "缺少撤销该流水的权限。" : cause.message);
        } else {
          setError("撤销结果暂未确认，可重试原请求。");
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
  });
  if (bill.modelVersion !== 2 || !permissions.includes("rental_bills:read")) return null;

  const closeRevoke = () => {
    if (busy) return;
    setEntryToRevoke(null);
    form.reset();
    setError(null);
    attempt.current = null;
  };

  return (
    <>
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">收退款记录</h2>
        {query.isPending ? <p role="status">正在读取收退款记录…</p> : null}
        {query.isError ? (
          <div>
            <p role="alert">收退款记录读取失败。</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {query.data?.items.length ? (
          <ul className="divide-y">
            {query.data.items.map((entry) => {
              const revokePermission: PermissionKey =
                entry.kind === "receipt" ? "rental_receipts:revoke" : "rental_refunds:revoke";
              return (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  key={entry.id}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="tabular-nums">
                      {entry.kind === "receipt" ? "收款" : "退款"} ·{" "}
                      {formatBillAmount(entry.amountMinor, bill.currencyCode)} · {entry.occurredOn}
                    </p>
                    {entry.note ? (
                      <p className="break-words text-muted-foreground">备注：{entry.note}</p>
                    ) : null}
                    {entry.revokedAt ? (
                      <p className="break-words text-muted-foreground">
                        已撤销 · {entry.revokeReason ?? "未提供原因"}
                      </p>
                    ) : null}
                  </div>
                  {!entry.revokedAt && bill.financial && permissions.includes(revokePermission) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEntryToRevoke(entry);
                        form.reset();
                        setError(null);
                        attempt.current = null;
                      }}
                    >
                      撤销{entry.kind === "receipt" ? "收款" : "退款"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : query.isSuccess ? (
          <p className="text-sm text-muted-foreground">暂无收退款记录。</p>
        ) : null}
        {query.data && query.data.total > query.data.pageSize ? (
          <p className="text-xs text-muted-foreground">显示最近 {query.data.pageSize} 笔记录。</p>
        ) : null}
      </section>
      <Dialog open={Boolean(entryToRevoke)} onOpenChange={(open) => !open && closeRevoke()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>撤销{entryToRevoke?.kind === "refund" ? "退款" : "收款"}</DialogTitle>
            <DialogDescription>保留原始资金流水并记录撤销原因。</DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="reason">
              {(field) => {
                const fieldError = field.state.meta.isTouched
                  ? validationMessage(field.state.meta.errors[0])
                  : undefined;
                return (
                  <label className="space-y-1 text-sm" htmlFor="cash-revoke-reason">
                    <span>撤销原因</span>
                    <Input
                      aria-label="撤销原因"
                      id="cash-revoke-reason"
                      value={field.state.value}
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={fieldError ? `${field.name}-error` : undefined}
                      onChange={(event) => {
                        field.handleChange(event.target.value);
                        attempt.current = null;
                        setError(null);
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
            {error ? <p role="alert">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeRevoke} disabled={busy}>
                取消
              </Button>
              <div className="flex gap-2">
                <button className="sr-only" type="submit" tabIndex={-1} aria-hidden="true">
                  提交
                </button>
                <Button type="submit" disabled={busy}>
                  {busy ? "正在撤销…" : "确认撤销"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
