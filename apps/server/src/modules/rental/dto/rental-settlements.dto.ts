import { z } from "zod";

import { rentalExpectedVersionSchema, rentalIdempotencyKeySchema } from "./rental-charges.dto.js";
import {
  optionalRentalMeterReadingsSchema,
  rentalCompleteMeterReadingsSchema,
} from "./rental-meters.dto.js";
import { rentalExtraFeeInputSchema } from "./rental-monthly-bills.dto.js";

const settlementPreviewShape = {
  contractId: z.string().uuid(),
  finalReadings: optionalRentalMeterReadingsSchema.optional(),
  extraFees: z.array(rentalExtraFeeInputSchema),
};

/** 预览整份合同结算；有效结束日期和必需读数由服务端生命周期判断。 */
export const previewRentalSettlementSchema = z.object(settlementPreviewShape).strict();

/** 确认预览版本；允许省略终读数以支持起租前取消结算。 */
export const confirmRentalSettlementSchema = z
  .object({
    ...settlementPreviewShape,
    finalReadings: rentalCompleteMeterReadingsSchema.optional(),
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
  })
  .strict();

/** 合同结算预览的校验后输入。 */
export type PreviewRentalSettlementDto = z.output<typeof previewRentalSettlementSchema>;
/** 合同结算确认的校验后输入。 */
export type ConfirmRentalSettlementDto = z.output<typeof confirmRentalSettlementSchema>;
