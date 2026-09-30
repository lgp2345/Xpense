import { z } from "zod";

import { contractCalendarDateSchema } from "./create-contract.dto.js";
import {
  rentalExpectedVersionSchema,
  rentalIdempotencyKeySchema,
  rentalReasonSchema,
  rentalSafeMinorAmountSchema,
} from "./rental-charges.dto.js";

/** 一个收退款事实只能归属一个账单或结算单。 */
export const rentalCashTargetSchema = z.union([
  z.object({ kind: z.literal("bill"), billId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("settlement"), settlementId: z.string().uuid() }).strict(),
]);

const cashNoteSchema = z.string().trim().max(1000).optional();

/** 登记一笔综合账单或结算补款。 */
export const recordRentalReceiptSchema = z
  .object({
    target: rentalCashTargetSchema,
    amountMinor: rentalSafeMinorAmountSchema.min(1),
    occurredOn: contractCalendarDateSchema,
    note: cashNoteSchema,
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
  })
  .strict();

/** 整额确认押金已收，由服务端读取押金账单金额。 */
export const confirmRentalDepositReceiptSchema = z
  .object({
    billId: z.string().uuid(),
    occurredOn: contractCalendarDateSchema,
    note: cashNoteSchema,
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
  })
  .strict();

/** 按当前全部待退金额确认退款，不接受客户端金额。 */
export const confirmRentalRefundSchema = z
  .object({
    target: rentalCashTargetSchema,
    occurredOn: contractCalendarDateSchema,
    note: cashNoteSchema,
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
  })
  .strict();

/** 撤销收款或退款事实必须记录原因。 */
export const revokeRentalCashSchema = z
  .object({
    entryId: z.string().uuid(),
    reason: rentalReasonSchema,
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
  })
  .strict();

/** 收款登记的校验后输入。 */
export type RecordRentalReceiptDto = z.output<typeof recordRentalReceiptSchema>;
/** 押金整额收款的校验后输入。 */
export type ConfirmRentalDepositReceiptDto = z.output<typeof confirmRentalDepositReceiptSchema>;
/** 退款登记的校验后输入。 */
export type ConfirmRentalRefundDto = z.output<typeof confirmRentalRefundSchema>;
/** 撤销收退款事实的校验后输入。 */
export type RevokeRentalCashDto = z.output<typeof revokeRentalCashSchema>;
