import type { rentalFinanceRequests } from "../../db/schema.js";
import type { RequestResult } from "./rental-finance.types.js";

export type FinanceRequestRecord = typeof rentalFinanceRequests.$inferSelect;
export type FinanceRequestActor = { userId: string };
export type CompleteFinanceRequestInput = {
  idempotencyKey: string;
  action: string;
  requestHash: string;
  result: RequestResult;
};
