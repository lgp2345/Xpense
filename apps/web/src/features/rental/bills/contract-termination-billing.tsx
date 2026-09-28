import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import type { RentalTerminationPreview, TerminateRentalContractRequest } from "@xpense/shared";
import { useEffect, useMemo, useState } from "react";
import type { RentalBillsApi } from "../../../services/rental-bills-api";
import { rentalBillsQueryOptions } from "../../../services/rental-bills-query";
import { isCalendarDate } from "../contracts/contract-action-model";
import { billGenerationFormSchema, parseTerminationAmount } from "./bill-generation-form";
import { TerminationBillingFields } from "./termination-billing-fields";

export type TerminationBillingState = {
  ready: boolean;
  confirmation?: TerminateRentalContractRequest["billingConfirmation"];
};
export function ContractTerminationBilling({
  api,
  organizationId,
  contractId,
  terminationDate,
  canAdjust,
  onChange,
}: {
  api: RentalBillsApi;
  organizationId: string;
  contractId: string;
  terminationDate: string;
  canAdjust: boolean;
  onChange: (state: TerminationBillingState) => void;
}) {
  const form = useForm({
    defaultValues: { depositDueDates: {}, unifiedDate: "", amountText: "", reason: "" },
    validators: { onChange: billGenerationFormSchema },
  });
  const values = useStore(form.store, (state) => state.values);
  const active = useQuery(
    rentalBillsQueryOptions.list(api, organizationId, {
      contractId,
      status: "active",
      pageSize: 1,
    }),
  );
  const voided = useQuery(
    rentalBillsQueryOptions.list(api, organizationId, {
      contractId,
      status: "voided",
      pageSize: 1,
    }),
  );
  const historyReady = active.isSuccess && voided.isSuccess;
  const hasHistory = historyReady && active.data.total + voided.data.total > 0;
  const [preview, setPreview] = useState<{
    data: RentalTerminationPreview | null;
    isError: boolean;
  }>({ data: null, isError: false });
  useEffect(() => {
    let current = true;
    setPreview({ data: null, isError: false });
    if (organizationId && hasHistory && canAdjust && isCalendarDate(terminationDate)) {
      void api.previewTermination({ contractId, terminationDate }).then(
        (data) => {
          if (current) setPreview({ data, isError: false });
        },
        () => {
          if (current) setPreview({ data: null, isError: true });
        },
      );
    }
    return () => {
      current = false;
    };
  }, [api, contractId, organizationId, terminationDate, hasHistory, canAdjust]);
  const amount = parseTerminationAmount(values.amountText);
  const confirmation = useMemo(
    () =>
      preview.data && amount !== null && values.reason.trim()
        ? {
            expectedVersion: preview.data.version,
            finalAmountMinor: amount,
            reason: values.reason.trim(),
          }
        : undefined,
    [preview.data, amount, values.reason],
  );
  const ready = historyReady && (!hasHistory || Boolean(confirmation));
  useEffect(() => {
    onChange(confirmation && ready ? { ready, confirmation } : { ready });
  }, [ready, confirmation, onChange]);
  if (active.isError || voided.isError) return <p role="alert">无法读取账单历史，请关闭后重试。</p>;
  if (!historyReady) return <p role="status">正在检查已有应收…</p>;
  if (!hasHistory)
    return (
      <p className="text-sm text-muted-foreground">
        尚无账单，终止时无需财务确认；首次生成时确认终止当期应收。
      </p>
    );
  if (!canAdjust) return <p role="alert">此合同已有账单，终止会调整应收，需要账单调整权限。</p>;
  if (!isCalendarDate(terminationDate))
    return <p className="text-sm text-muted-foreground">填写终止日期后读取财务参考值。</p>;
  if (preview.isError) return <p role="alert">读取终止参考失败，请修改日期或关闭后重试。</p>;
  if (!preview.data) return <p role="status">正在读取终止当期参考值…</p>;
  return (
    <TerminationBillingFields
      preview={preview.data}
      amountText={values.amountText}
      reason={values.reason}
      onAmountChange={(value) => form.setFieldValue("amountText", value)}
      onReasonChange={(value) => form.setFieldValue("reason", value)}
    />
  );
}
