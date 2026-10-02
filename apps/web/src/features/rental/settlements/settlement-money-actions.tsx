import type { RentalSettlementDetail } from "@xpense/shared";
import { formatBillAmount } from "../bills/bill-format";

export function SettlementMoneySummary({ settlement }: { settlement: RentalSettlementDetail }) {
  return (
    <section className="space-y-2 rounded-lg border p-4" aria-label="结算金额摘要">
      <h2 className="font-semibold">实际收退</h2>
      <p className="text-sm tabular-nums">
        已收 {formatBillAmount(settlement.balance.receivedMinor)} · 已退{" "}
        {formatBillAmount(settlement.balance.refundedMinor)}
      </p>
      {settlement.balance.outstandingMinor > 0 ? (
        <p className="text-sm tabular-nums">
          结算已确认（{settlement.effectiveEndDate}）；合同空间已按日期结束，仍待补款{" "}
          {formatBillAmount(settlement.balance.outstandingMinor)}。
        </p>
      ) : settlement.balance.refundableMinor > 0 ? (
        <p className="text-sm tabular-nums">
          结算已确认（{settlement.effectiveEndDate}）；合同空间已按日期结束，仍待退款{" "}
          {formatBillAmount(settlement.balance.refundableMinor)}。
        </p>
      ) : (
        <p className="text-sm">结算已确认（{settlement.effectiveEndDate}），已结清。</p>
      )}
    </section>
  );
}
