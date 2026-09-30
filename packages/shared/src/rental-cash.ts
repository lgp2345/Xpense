/** 收款或退款事实类型。 */
export const rentalCashKinds = ["receipt", "refund"] as const;
export type RentalCashKind = (typeof rentalCashKinds)[number];

/** 收退款的来源用途；记录不表示真实转账由系统执行。 */
export const rentalCashPurposes = [
  "bill_receipt",
  "deposit_receipt",
  "settlement_receipt",
  "refund",
] as const;
export type RentalCashPurpose = (typeof rentalCashPurposes)[number];

/** 资金操作绑定一个账单或合同结算，不允许双目标。 */
export type RentalCashTarget =
  | { kind: "bill"; billId: string }
  | { kind: "settlement"; settlementId: string };

/** 登记综合账单或结算补款。 */
export type RecordRentalReceiptRequest = {
  target: RentalCashTarget;
  amountMinor: number;
  occurredOn: string;
  note?: string;
  expectedVersion: string;
  idempotencyKey: string;
};

/** 按服务器押金应收金额整额确认收款。 */
export type ConfirmRentalDepositReceiptRequest = {
  billId: string;
  occurredOn: string;
  note?: string;
  expectedVersion: string;
  idempotencyKey: string;
};

/** 按服务器当前全部待退金额确认退款。 */
export type ConfirmRentalRefundRequest = {
  target: RentalCashTarget;
  occurredOn: string;
  note?: string;
  expectedVersion: string;
  idempotencyKey: string;
};

/** 撤销错误收款或退款登记并保留原因。 */
export type RevokeRentalCashRequest = {
  entryId: string;
  reason: string;
  expectedVersion: string;
  idempotencyKey: string;
};

/** 根据实际收退款事实计算的账单或结算余额。 */
export type RentalFinancialBalance = {
  receivedMinor: number;
  refundedMinor: number;
  netReceivedMinor: number;
  outstandingMinor: number;
  refundableMinor: number;
  state: RentalFinancialState;
  overdue: boolean;
  version: string;
};

/** 财务余额派生状态。 */
export const rentalFinancialStates = ["unpaid", "partial", "settled", "refundable"] as const;
export type RentalFinancialState = (typeof rentalFinancialStates)[number];

/** 一条可追溯、可撤销的租赁收退款事实。 */
export type RentalCashEntry = {
  id: string;
  contractId: string;
  target: RentalCashTarget;
  kind: RentalCashKind;
  purpose: RentalCashPurpose;
  amountMinor: number;
  occurredOn: string;
  note: string | null;
  createdAt: string;
  createdByUserId: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revokeReason: string | null;
};
