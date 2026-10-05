import { z } from "zod";
import { rentalDecimalFourSchema, rentalFixedFeesSchema } from "./rental-charges.dto.js";
import { optionalRentalMeterReadingsSchema } from "./rental-meters.dto.js";

/** 合同初始收费设置；底数允许交接时后补，不将空读数当作零。 */
export const contractChargeSetupSchema = z
  .object({
    chargeTerms: z
      .object({
        waterCollectionEnabled: z.boolean(),
        electricityCollectionEnabled: z.boolean(),
        waterUnitPrice: rentalDecimalFourSchema,
        electricityUnitPrice: rentalDecimalFourSchema,
        fixedFees: rentalFixedFeesSchema,
      })
      .strict()
      .refine(
        (terms) => new Set(terms.fixedFees.map(({ id }) => id)).size === terms.fixedFees.length,
        "收费事项不能重复",
      ),
    baselineReadings: optionalRentalMeterReadingsSchema,
  })
  .strict();
