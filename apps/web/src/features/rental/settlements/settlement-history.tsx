import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalCashEntry, RentalSettlementDetail } from "@xpense/shared";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "../../../services/api-client";
import {
  createRentalFinanceAttempt,
  type RentalFinanceApi,
} from "../../../services/rental-finance-api";
import { invalidateRentalFinance, rentalFinanceKeys } from "../../../services/rental-finance-query";
import { formatBillAmount } from "../bills/bill-format";

const statusLabels = {
  pending_collection: "仍待补款",
  pending_refund: "仍待退款",
  settled: "已结清",
} as const;

export function SettlementHistory({
  organizationId,
  contractId,
  api,
}: {
  organizationId: string;
  contractId: string;
  api: RentalFinanceApi;
}) {
  const query = useQuery({
    queryKey: rentalFinanceKeys.settlementHistory(organizationId, contractId, {
      page: 1,
      pageSize: 20,
    }),
    queryFn: ({ signal }) =>
      api.settlementHistory({ contractId, page: 1, pageSize: 20 }, { signal }),
    enabled: Boolean(organizationId && contractId),
  });

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="结算历史">
      <h2 className="font-semibold">结算历史</h2>
      {query.isPending ? <p role="status">正在读取结算历史…</p> : null}
      {query.isError ? (
        <div className="space-y-2">
          <p role="alert">结算历史读取失败。</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
      {query.data?.items.length ? (
        <ul className="divide-y">
          {query.data.items.map((item) => (
            <li className="flex flex-wrap justify-between gap-2 py-3 text-sm" key={item.id}>
              <span>
                第 {item.revision} 次结算更正 · {item.settlement.effectiveEndDate} ·{" "}
                {statusLabels[item.settlement.status]}
              </span>
              <span className="tabular-nums">
                最终费用 {formatBillAmount(item.settlement.finalCostMinor)}
              </span>
            </li>
          ))}
        </ul>
      ) : query.isSuccess ? (
        <p className="text-sm text-muted-foreground">暂无结算历史。</p>
      ) : null}
      {query.data && query.data.total > query.data.pageSize ? (
        <p className="text-xs text-muted-foreground">显示最近 {query.data.pageSize} 条记录。</p>
      ) : null}
    </section>
  );
}

export function SettlementCashHistory({
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
  const cash = useQuery({
    queryKey: rentalFinanceKeys.settlementCash(
      organizationId,
      settlement.contractId,
      settlement.id,
      { page: 1, pageSize: 20 },
    ),
    queryFn: ({ signal }) =>
      api.listCash(
        { target: { kind: "settlement", settlementId: settlement.id }, page: 1, pageSize: 20 },
        { signal },
      ),
    enabled: Boolean(organizationId && settlement.id),
  });
  const [selectedEntry, setSelectedEntry] = useState<RentalCashEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ submit: () => Promise<RentalCashEntry> } | null>(null);
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

  const revokeForm = useForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: z.object({ reason: z.string().trim().min(1, "请填写撤销原因。") }) },
    onSubmit: async ({ value }) => {
      if (!selectedEntry) return;
      const permission: PermissionKey =
        selectedEntry.kind === "receipt" ? "rental_receipts:revoke" : "rental_refunds:revoke";
      if (!permissions.includes(permission)) return;
      const input = {
        entryId: selectedEntry.id,
        reason: value.reason.trim(),
        expectedVersion: settlement.balance.version,
        idempotencyKey: crypto.randomUUID(),
      };
      const submit = selectedEntry.kind === "receipt" ? api.revokeReceipt : api.revokeRefund;
      attempt.current ??= createRentalFinanceAttempt(submit, input);
      await submitRevoke(attempt.current.submit);
    },
  });

  async function submitRevoke(submit: () => Promise<RentalCashEntry>) {
    if (busy) return;
    const capturedContext = contextKey;
    setBusy(true);
    setError(null);
    try {
      await submit();
      if (!mounted.current || liveContext.current !== capturedContext) return;
      attempt.current = null;
      setSelectedEntry(null);
      revokeForm.reset();
      void invalidateRentalFinance(queryClient, organizationId, settlement.contractId);
    } catch (cause) {
      if (!mounted.current || liveContext.current !== capturedContext) return;
      if (cause instanceof ApiError && cause.status === 409) {
        attempt.current = null;
        setError("结算资金余额已变化，请刷新后重试。");
      } else if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
        attempt.current = null;
        setError(cause.status === 403 ? "缺少撤销资金记录权限。" : cause.message);
      } else {
        setError("撤销结果暂未确认，可重试原请求。");
      }
    } finally {
      if (mounted.current && liveContext.current === capturedContext) setBusy(false);
    }
  }

  function revokePermission(entry: RentalCashEntry): PermissionKey {
    return entry.kind === "receipt" ? "rental_receipts:revoke" : "rental_refunds:revoke";
  }

  return (
    <section className="space-y-3" aria-label="结算收退款记录">
      <h3 className="font-medium">收退款记录</h3>
      {cash.isPending ? <p role="status">正在读取结算收退款记录…</p> : null}
      {cash.isError ? (
        <div>
          <p role="alert">结算收退款记录读取失败。</p>
          <Button variant="outline" onClick={() => void cash.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
      {cash.data?.items.length ? (
        <ul className="divide-y">
          {cash.data.items.map((entry) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              key={entry.id}
            >
              <span className="tabular-nums">
                {entry.kind === "receipt" ? "收款" : "退款"} · {formatBillAmount(entry.amountMinor)}{" "}
                · {entry.occurredOn}
                {entry.revokedAt ? ` · 已撤销（${entry.revokeReason ?? "未提供原因"}）` : ""}
              </span>
              {!entry.revokedAt && permissions.includes(revokePermission(entry)) ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (selectedEntry?.id !== entry.id || selectedEntry.kind !== entry.kind) {
                      attempt.current = null;
                      setError(null);
                      revokeForm.reset();
                    }
                    setSelectedEntry(entry);
                  }}
                >
                  撤销{entry.kind === "receipt" ? "收款" : "退款"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : cash.isSuccess ? (
        <p className="text-sm text-muted-foreground">暂无收退款记录。</p>
      ) : null}
      {selectedEntry ? (
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void revokeForm.handleSubmit();
          }}
        >
          <revokeForm.Field name="reason">
            {(field) => (
              <RevokeReasonField
                label={`撤销${selectedEntry.kind === "receipt" ? "收款" : "退款"}原因`}
                value={field.state.value}
                error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
                onChange={(value) => {
                  field.handleChange(value);
                  attempt.current = null;
                }}
              />
            )}
          </revokeForm.Field>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSelectedEntry(null);
                revokeForm.reset();
                attempt.current = null;
              }}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              确认撤销
            </Button>
          </div>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function RevokeReasonField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
