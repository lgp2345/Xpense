import type { PermissionKey, RentalBillSummary } from "@xpense/shared";
import { z } from "zod";
import { isCalendarDate } from "../contracts/contract-action-model";
import { parseSignedMoneyMinor } from "./monthly-bill-form";

export function canRegisterBillReceipt(
  bill: RentalBillSummary,
  permissions: readonly PermissionKey[],
): boolean {
  return (
    bill.modelVersion === 2 &&
    !bill.settlementId &&
    Boolean(bill.financial) &&
    permissions.includes("rental_receipts:create") &&
    (bill.financial?.outstandingMinor ?? 0) > 0
  );
}

export function billFinancialLabel(bill: RentalBillSummary): string {
  if (bill.settlementId) return "已纳入结算";
  if (bill.modelVersion !== 2 || !bill.financial) return "收款状态未提供";
  return { unpaid: "待收款", partial: "部分收款", settled: "已结清", refundable: "待退款" }[
    bill.financial.state
  ];
}

export function cashAmountText(minor: number): string {
  const value = BigInt(minor);
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

export function billCashBatchSchema(bills: readonly RentalBillSummary[]) {
  return z
    .object({
      occurredOn: z
        .string()
        .min(1, "请选择发生日期。")
        .refine((value) => !value || isCalendarDate(value), "请输入有效发生日期。"),
      note: z.string(),
      amounts: z.record(z.string(), z.string()),
    })
    .superRefine((values, context) => {
      for (const bill of bills) {
        if (bill.type === "deposit") continue;
        const amount = parseSignedMoneyMinor(values.amounts[bill.id] ?? "");
        if (amount === null || amount <= 0 || amount > (bill.financial?.outstandingMinor ?? 0)) {
          context.addIssue({
            code: "custom",
            path: ["amounts", bill.id],
            message: "请输入不超过待收金额的有效收款金额。",
          });
        }
      }
    });
}
