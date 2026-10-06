import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import type { PermissionKey, RentalBillSummary } from "@xpense/shared";
import { useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  createRentalBillCashBatchAttempt,
  type RentalBillCashBatchResult,
} from "../../../services/rental-bill-cash-batch";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import type { RentalFinanceApi } from "../../../services/rental-finance-api";
import { invalidateRentalFinance } from "../../../services/rental-finance-query";
import { BillCashBatchItems, BillCashBatchSummary } from "./bill-cash-batch-items";
import { BillCashDialogFrame, BillCashFormFields } from "./bill-cash-dialog";
import { billCashBatchSchema, canRegisterBillReceipt, cashAmountText } from "./bill-cash-model";
import { formatBillAmount } from "./bill-format";
import { parseSignedMoneyMinor } from "./monthly-bill-form";

export type BillCashBatchProps = {
  organizationId: string;
  bills: readonly RentalBillSummary[];
  billsApi: RentalBillsApi;
  api: RentalFinanceApi;
  permissions: readonly PermissionKey[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (results: RentalBillCashBatchResult[]) => void;
};

function fieldMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  return error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : undefined;
}

export function BillCashBatchSession({
  organizationId,
  bills,
  billsApi,
  api,
  permissions,
  onOpenChange,
  onUpdated,
}: BillCashBatchProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [results, setResults] = useState<RentalBillCashBatchResult[]>([]);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const attempt = useRef<ReturnType<typeof createRentalBillCashBatchAttempt> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const authorized =
    bills.length > 0 && bills.every((bill) => canRegisterBillReceipt(bill, permissions));
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;
  const schema = billCashBatchSchema(bills);
  const form = useForm({
    defaultValues: {
      occurredOn: "",
      note: "",
      amounts: Object.fromEntries(
        bills
          .filter((bill) => bill.type !== "deposit")
          .map((bill) => [bill.id, cashAmountText(bill.financial?.outstandingMinor ?? 0)]),
      ),
    },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async () => {
      if (authorized && !attempt.current && !inFlight.current) setReviewOpen(true);
    },
  });
  const registered = results.filter((result) => result.state === "success").length;
  const failed = results.filter((result) => result.state === "failed").length;
  const pending = results.filter((result) => result.state === "pending").length;
  const closeBlocked = busy || results.some((result) => result.outcomeUnknown);
  const locked = busy || Boolean(attempt.current);
  const execute = async () => {
    if (!authorized || inFlight.current) return;
    inFlight.current = true;
    setReviewOpen(false);
    setBusy(true);
    attempt.current ??= createRentalBillCashBatchAttempt({
      bills,
      billsApi,
      financeApi: api,
      occurredOn: form.state.values.occurredOn,
      note: form.state.values.note,
      // 表单 schema 已验证普通收款金额，解析结果必为最小单位整数。
      amounts: Object.fromEntries(
        Object.entries(form.state.values.amounts).map(([id, value]) => [
          id,
          parseSignedMoneyMinor(value) as number,
        ]),
      ),
    });
    try {
      const updated = await attempt.current.submit(() => mounted.current && authorizedRef.current);
      if (!mounted.current) return;
      setResults(updated);
      onUpdated(updated);
      const successfulIds = new Set(
        updated.filter((result) => result.state === "success").map((result) => result.billId),
      );
      const contracts = new Set(
        bills.filter((bill) => successfulIds.has(bill.id)).map((bill) => bill.contractId),
      );
      for (const contractId of contracts)
        void invalidateRentalFinance(queryClient, organizationId, contractId);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <>
      <BillCashDialogFrame
        title="批量登记收款"
        description={`共 ${bills.length} 张账单，统一发生日期，逐笔核对收款金额。`}
        busy={closeBlocked}
        onOpenChange={onOpenChange}
        onSubmit={(event) => {
          event.preventDefault();
          if (!attempt.current) void form.handleSubmit();
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={closeBlocked}
              onClick={() => onOpenChange(false)}
            >
              {registered === bills.length ? "完成" : "关闭"}
            </Button>
            {failed > 0 || pending > 0 ? (
              <Button type="button" disabled={busy || !authorized} onClick={() => void execute()}>
                {busy ? "正在登记…" : pending > 0 ? "继续登记" : "重试失败账单"}
              </Button>
            ) : !attempt.current ? (
              <Button type="submit" disabled={busy || !authorized}>
                核对并登记
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-5 pb-4">
          <BillCashBatchSummary results={results} />
          <form.Field name="occurredOn">
            {(dateField) => (
              <form.Field name="note">
                {(noteField) => (
                  <BillCashFormFields
                    occurredOn={dateField.state.value}
                    note={noteField.state.value}
                    dateError={
                      dateField.state.meta.isTouched
                        ? fieldMessage(dateField.state.meta.errors[0])
                        : undefined
                    }
                    disabled={locked}
                    onDateChange={dateField.handleChange}
                    onNoteChange={noteField.handleChange}
                  />
                )}
              </form.Field>
            )}
          </form.Field>
          {!authorized ? (
            <p role="alert" className="text-sm text-destructive">
              选中账单无法登记当前操作，请重新选择。
            </p>
          ) : null}
          <BillCashBatchItems
            bills={bills}
            results={results}
            locked={locked}
            renderAmount={(bill) => (
              <form.Field name={`amounts.${bill.id}`}>
                {(field) => {
                  const error = field.state.meta.isTouched
                    ? fieldMessage(field.state.meta.errors[0])
                    : undefined;
                  return (
                    <div className="space-y-1 text-sm">
                      <label htmlFor={`batch-cash-amount-${bill.id}`}>
                        本次收款金额（{bill.currencyCode}）
                      </label>
                      <Input
                        id={`batch-cash-amount-${bill.id}`}
                        aria-label={`${bill.billNumber} 本次收款金额`}
                        inputMode="decimal"
                        value={field.state.value}
                        disabled={locked}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `amount-error-${bill.id}` : undefined}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        待收{" "}
                        {formatBillAmount(bill.financial?.outstandingMinor ?? 0, bill.currencyCode)}
                        ，可登记部分收款。
                      </p>
                      {error ? (
                        <p id={`amount-error-${bill.id}`} role="alert" className="text-destructive">
                          {error}
                        </p>
                      ) : null}
                    </div>
                  );
                }}
              </form.Field>
            )}
          />
          {busy ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在逐笔登记，请稍候…
            </p>
          ) : null}
        </div>
      </BillCashDialogFrame>
      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量收款</AlertDialogTitle>
            <AlertDialogDescription>
              将为 {bills.length} 张账单分别登记收款，发生日期为{" "}
              {form.state.values.occurredOn.replaceAll("-", "/")}。请确认款项已实际收取。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-60 space-y-2 overflow-y-auto text-sm">
            {bills.map((bill) => (
              <p key={bill.id} className="flex flex-wrap justify-between gap-2">
                <span>{bill.billNumber}</span>
                <span className="tabular-nums">
                  {formatBillAmount(
                    bill.type === "deposit"
                      ? (bill.financial?.outstandingMinor ?? 0)
                      : (parseSignedMoneyMinor(form.state.values.amounts[bill.id] ?? "") ?? 0),
                    bill.currencyCode,
                  )}
                </span>
              </p>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>返回核对</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !authorized} onClick={() => void execute()}>
              确认登记收款
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
