import type { RentalContractAvailability, RentalContractDetail } from "@xpense/shared";
import { Button } from "@/components/ui/button";
import type { ContractFormValues } from "../contract-form-schema";
import { calendarPreview } from "./contract-terms-step";

export function ContractReviewStep({
  serverDraft,
  availability,
  dirty = false,
  confirming,
  onConfirm,
  onEdit,
}: {
  values: ContractFormValues;
  serverDraft: RentalContractDetail | null;
  availability: RentalContractAvailability | null;
  dirty?: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onEdit: (step: 0 | 1 | 2) => void;
}) {
  const spaces = serverDraft?.spaces ?? [];
  const parties = serverDraft?.parties ?? [];
  const payer = parties.find((party) => party.isPrimaryPayer);
  const missing = "尚未保存";
  return (
    <section aria-labelledby="contract-review-title" className="space-y-4">
      <h2 id="contract-review-title" tabIndex={-1} className="text-lg font-medium">
        复核并确认
      </h2>
      <div className="rounded-md border p-4 text-sm">
        <p>房产：{serverDraft?.propertyName ?? serverDraft?.propertyId ?? missing}</p>
        <p>
          空间：
          {serverDraft && spaces.length
            ? spaces
                .map(
                  (space) =>
                    `${space.spacePath.map((node) => node.name).join(" / ")} ${space.spaceName}（分摊 ${space.rentAllocationMinor === null ? "未设置" : `${space.rentAllocationMinor} 分`}）`,
                )
                .join("、")
            : missing}
        </p>
        <p>
          承租方：
          {serverDraft && parties.length ? parties.map((party) => party.name).join("、") : missing}
        </p>
        <p>
          主付款人：
          {payer?.name ?? missing}
        </p>
        <p>
          租期：{serverDraft?.startDate || missing} 至 {serverDraft?.endDate || missing}
        </p>
        <p>
          月租：
          {serverDraft?.rentAmountMinor === null || serverDraft?.rentAmountMinor === undefined
            ? missing
            : `${serverDraft.rentAmountMinor} 分`}
        </p>
        <p>
          计费：{serverDraft?.billingAnchor || missing} · 每
          {serverDraft?.paymentIntervalMonths ?? missing}个月 · 提前
          {serverDraft?.dueDaysBefore ?? missing}天
        </p>
        <p>
          押金：
          {serverDraft?.depositTerms.length
            ? serverDraft.depositTerms
                .map((deposit) =>
                  deposit.finalAmountMinor === null
                    ? `${deposit.customName ?? deposit.type}（${deposit.calculationMode === "rent_multiple" ? `月租 × ${deposit.rentMultiple}` : "固定金额"}）`
                    : `${deposit.customName ?? deposit.type} ${deposit.finalAmountMinor} 分`,
                )
                .join("、")
            : serverDraft
              ? "无"
              : missing}
        </p>
        <p>备注：{serverDraft?.note || (serverDraft ? "无" : missing)}</p>
      </div>
      {serverDraft?.startDate && serverDraft.endDate && serverDraft.billingAnchor ? (
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">账期预览</p>
          {calendarPreview(
            serverDraft.startDate,
            serverDraft.endDate,
            serverDraft.billingAnchor,
            serverDraft.paymentIntervalMonths || 1,
          ).map((period) => (
            <p key={period}>{period}</p>
          ))}
        </div>
      ) : null}
      {dirty ? (
        <p role="status" className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm">
          有未保存更改，确认前会先保存当前步骤。
        </p>
      ) : null}
      {availability && !availability.available ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p>存在空间合同冲突，请返回修改。</p>
          {availability.conflicts.map((conflict) => (
            <p key={`${conflict.contractId}-${conflict.spaceId}`}>
              {conflict.contractNumber} · {conflict.spaceName}
            </p>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => onEdit(0)}>
          返回修改空间
        </Button>
        <Button type="button" variant="outline" onClick={() => onEdit(1)}>
          返回修改承租方
        </Button>
        <Button type="button" variant="outline" onClick={() => onEdit(2)}>
          返回修改条款
        </Button>
        <Button type="button" disabled={confirming || !serverDraft} onClick={onConfirm}>
          {confirming ? "确认中..." : "检查可用性并确认"}
        </Button>
      </div>
    </section>
  );
}
