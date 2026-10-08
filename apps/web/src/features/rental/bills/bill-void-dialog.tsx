import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import type { RentalBillDetail } from "@xpense/shared";
import { useId, useRef, useState } from "react";
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
import { invalidateRentalFinance } from "../../../services/rental-finance-query";

type Props = {
  organizationId: string;
  bill: RentalBillDetail;
  api: RentalFinanceApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoided: () => void;
};
const schema = z.object({ reason: z.string().trim().min(1, "请填写作废原因。").max(1000) });
export function BillVoidDialog(props: Props) {
  return props.open ? (
    <VoidSession
      key={`${props.organizationId}:${props.bill.id}:${props.bill.version}`}
      {...props}
    />
  ) : null;
}
function VoidSession({ organizationId, bill, api, onOpenChange, onVoided }: Props) {
  const reasonId = useId();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const attempt = useRef<ReturnType<typeof createRentalFinanceAttempt> | null>(null);
  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setBusy(true);
      setError(null);
      attempt.current ??= createRentalFinanceAttempt(api.voidPeriodBill, {
        billId: bill.id,
        reason: value.reason.trim(),
        expectedVersion: bill.version,
        idempotencyKey: crypto.randomUUID(),
      });
      try {
        await attempt.current.submit();
        await invalidateRentalFinance(client, organizationId, bill.contractId);
        onVoided();
        onOpenChange(false);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
          attempt.current = null;
          setError(cause.status === 409 ? "账单或资金已变化，请重新读取后确认。" : cause.message);
        } else setError("作废结果暂未确认，可重试原请求。");
      } finally {
        setBusy(false);
      }
    },
  });
  const reason = useStore(form.store, (state) => state.values.reason);
  const validation = schema.safeParse({ reason });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>作废末期账单</DialogTitle>
          <DialogDescription>
            作废 {bill.billNumber}{" "}
            后，下一账期恢复为本期，水电基准回退至上一张有效账单。已有有效收退款须先撤销。历史记录会保留。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            void form.handleSubmit();
          }}
        >
          <form.Field name="reason">
            {(field) => (
              <label htmlFor={reasonId} className="block space-y-1 text-sm">
                <span>作废原因</span>
                <Input
                  id={reasonId}
                  aria-label="作废原因"
                  value={field.state.value}
                  disabled={busy}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                    attempt.current = null;
                  }}
                />
              </label>
            )}
          </form.Field>
          {attempted && !validation.success ? (
            <p role="alert" className="text-destructive">
              {validation.error.issues[0]?.message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button variant="destructive" type="submit" disabled={busy}>
              {busy ? "正在作废…" : "确认作废"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
