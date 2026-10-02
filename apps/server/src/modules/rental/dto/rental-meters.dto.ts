import { rentalMeterKinds } from "@xpense/shared";
import { z } from "zod";

import { contractCalendarDateSchema } from "./rental-calendar-date.schema.js";
import {
  rentalDecimalFourSchema,
  rentalExpectedVersionSchema,
  rentalIdempotencyKeySchema,
  rentalReasonSchema,
} from "./rental-charges.dto.js";

/** 一次实际水电表计读数；服务端根据合同及空间定位前驱边界。 */
export const rentalMeterReadingInputSchema = z
  .object({
    kind: z.enum(rentalMeterKinds),
    readingDate: contractCalendarDateSchema,
    reading: rentalDecimalFourSchema,
  })
  .strict();

/** 预览可以缺读数，但同一类型最多提供一条。 */
export const optionalRentalMeterReadingsSchema = z
  .array(rentalMeterReadingInputSchema)
  .max(2)
  .superRefine((readings, context) => {
    const kinds = readings.map(({ kind }) => kind);
    if (new Set(kinds).size !== kinds.length) {
      context.addIssue({ code: "custom", message: "水表和电表读数不能重复" });
    }
  });

/** 表计完整性由持有合同代收状态的服务端校验，结构允许按项目提交。 */
export const rentalCompleteMeterReadingsSchema = optionalRentalMeterReadingsSchema;

/** 修改入住交接水电底数。 */
export const updateRentalMeterBaselineSchema = z
  .object({
    contractId: z.string().uuid(),
    readings: rentalCompleteMeterReadingsSchema,
    expectedVersion: rentalExpectedVersionSchema,
    idempotencyKey: rentalIdempotencyKeySchema,
    reason: rentalReasonSchema,
  })
  .strict();

/** 更新水电底数的校验后输入。 */
export type UpdateRentalMeterBaselineDto = z.output<typeof updateRentalMeterBaselineSchema>;
