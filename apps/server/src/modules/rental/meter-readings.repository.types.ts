import type { RentalMeterReadingInput } from "@xpense/shared";
import type { rentalMeterReadingRevisions, rentalMeterReadings } from "../../db/schema.js";

/** repository 输入由服务端附加空间和前驱；不得直接接收公共 DTO。 */
export type MeterReadingWriteInput = RentalMeterReadingInput & {
  spaceId: string;
  predecessorId: string | null;
};
export type MeterReadingRecord = typeof rentalMeterReadings.$inferSelect;
export type MeterReadingRevisionRecord = typeof rentalMeterReadingRevisions.$inferSelect;
export type MeterReadingActor = { userId: string };
