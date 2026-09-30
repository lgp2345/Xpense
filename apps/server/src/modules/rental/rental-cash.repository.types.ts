import type { RentalCashEntry, RentalCashTarget } from "@xpense/shared";
import type { rentalCashEntries } from "../../db/schema.js";

export type RentalCashRecord = typeof rentalCashEntries.$inferSelect;
export type RentalCashActor = { userId: string };
export type RentalCashWriteInput = Omit<
  RentalCashEntry,
  | "id"
  | "contractId"
  | "createdAt"
  | "createdByUserId"
  | "revokedAt"
  | "revokedByUserId"
  | "revokeReason"
>;
export type RentalCashPage = { page: number; pageSize: number };
export type RentalCashHistory = {
  items: RentalCashRecord[];
  total: number;
  page: number;
  pageSize: number;
};
export type { RentalCashTarget };
