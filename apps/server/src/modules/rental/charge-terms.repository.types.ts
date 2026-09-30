import type { RentalFixedFee } from "@xpense/shared";
import type { rentalChargeTermRevisions, rentalChargeTerms } from "../../db/schema.js";

export type ChargeTermsRecord = typeof rentalChargeTerms.$inferSelect;
export type ChargeTermsRevisionRecord = typeof rentalChargeTermRevisions.$inferSelect;
export type ChargeTermsWriteInput = {
  waterUnitPrice: string;
  electricityUnitPrice: string;
  fixedFees: RentalFixedFee[];
};
export type ChargeTermsActor = { userId: string };
