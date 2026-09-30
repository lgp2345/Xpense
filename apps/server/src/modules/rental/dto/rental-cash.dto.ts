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

/** 现金列表使用唯一目标参数，分页默认 20 条且最多 100 条。 */
export const rentalCashListQuerySchema = z
  .object({
    kind: z.enum(["bill", "settlement"]),
    billId: z.string().uuid().optional(),
    settlementId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((query, context) => {
    const billTarget = query.kind === "bill" && query.billId !== undefined;
    const settlementTarget = query.kind === "settlement" && query.settlementId !== undefined;
    if (!billTarget && !settlementTarget) {
      context.addIssue({ code: "custom", message: "必须提供与 kind 匹配的唯一目标" });
    }
    if (query.billId !== undefined && query.settlementId !== undefined) {
      context.addIssue({ code: "custom", message: "账单和结算目标不能同时提供" });
    }
    if (query.kind === "bill" && query.settlementId !== undefined) {
      context.addIssue({ code: "custom", message: "账单目标不能包含 settlementId" });
    }
    if (query.kind === "settlement" && query.billId !== undefined) {
      context.addIssue({ code: "custom", message: "结算目标不能包含 billId" });
    }
  })
  .transform((query) => ({
    target:
      query.kind === "bill"
        ? ({ kind: "bill", billId: query.billId as string } as const)
        : ({ kind: "settlement", settlementId: query.settlementId as string } as const),
    page: query.page,
    pageSize: query.pageSize,
  }));

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
/** 现金列表的校验后目标和分页参数。 */
export type RentalCashListQueryDto = z.output<typeof rentalCashListQuerySchema>;
