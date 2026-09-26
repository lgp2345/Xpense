import { Button } from "@/components/ui/button";
import type { ContractFormValues } from "../contract-form-schema";
import { BillingPeriodPreview } from "./billing-period-preview";
import { calendarPreview } from "./contract-terms-step";

/** 新建合同复核当前页面数据，正式提交前不依赖服务端草稿。 */
export function ContractLocalReviewStep({
  values,
  names,
  busy,
  onConfirm,
  onEdit,
}: {
  values: ContractFormValues;
  names: Record<string, string>;
  busy: boolean;
  onConfirm: () => void;
  onEdit: (step: 0 | 1 | 2) => void;
}) {
  const payer = values.parties.find((party) => party.isPrimaryPayer);
  const depositLabels = {
    rental: "租赁押金",
    utility: "水电押金",
    access_card: "门禁卡押金",
    other: "其他押金",
  };
  return (
    <section aria-labelledby="contract-review-title" className="space-y-4">
      <h2 id="contract-review-title" tabIndex={-1} className="text-lg font-medium">
        复核并创建
      </h2>
      <div className="space-y-2 rounded-md border p-4 text-sm break-words">
        <p>房产：{names[values.propertyId] ?? values.propertyId}</p>
        <p>
          空间：
          {values.spaces
            .map(
              (space) =>
                `${names[space.spaceId] ?? space.spaceId}${space.rentAllocationText ? `（分摊 ${space.rentAllocationText} 元）` : ""}`,
            )
            .join("、")}
        </p>
        <p>
          承租方：
          {values.parties.map((party) => names[party.tenantId] ?? party.tenantId).join("、")}
        </p>
        <p>主付款人：{payer ? (names[payer.tenantId] ?? payer.tenantId) : "未选择"}</p>
        <p>合同编号：{values.externalContractNumber || "未填写"}</p>
        <p>
          租期：{values.startDate} 至 {values.endDate}
        </p>
        <p>月租：{values.rentAmountText} 元</p>
        <p>
          计费：{values.billingAnchor === "calendar_month" ? "自然月" : "合同起始日"} · 每{" "}
          {values.paymentIntervalMonths} 个月 · 提前 {values.dueDaysBeforeText} 天
        </p>
        <p>
          押金：
          {values.deposits.length
            ? values.deposits
                .map(
                  (deposit) =>
                    `${deposit.type === "other" ? deposit.customName : depositLabels[deposit.type]}（${deposit.calculationMode === "fixed_amount" ? `${deposit.fixedAmountText} 元` : `月租 × ${deposit.rentMultipleText}`}）`,
                )
                .join("、")
            : "无"}
        </p>
        <p>备注：{values.note || "无"}</p>
      </div>
      {values.startDate && values.endDate && values.billingAnchor ? (
        <BillingPeriodPreview
          anchor={values.billingAnchor}
          periods={calendarPreview(
            values.startDate,
            values.endDate,
            values.billingAnchor,
            Number(values.paymentIntervalMonths) || 1,
          )}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => onEdit(0)}>
          返回修改空间
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => onEdit(1)}>
          返回修改承租方
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => onEdit(2)}>
          返回修改条款
        </Button>
        <Button type="button" disabled={busy} onClick={onConfirm}>
          {busy ? "提交中..." : "创建合同"}
        </Button>
      </div>
    </section>
  );
}
