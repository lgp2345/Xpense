import type { rentalBillAdjustments, rentalBillGenerations, rentalBills } from "../../db/schema.js";

export type BillRecord = typeof rentalBills.$inferSelect;
export type BillFinanceSummaryRow = Pick<BillRecord, "id" | "contractId" | "modelVersion">;
export type GenerationRecord = typeof rentalBillGenerations.$inferSelect;
export type AdjustmentRecord = typeof rentalBillAdjustments.$inferSelect;
export type NewGeneration = typeof rentalBillGenerations.$inferInsert;
export type NewAdjustment = typeof rentalBillAdjustments.$inferInsert;
