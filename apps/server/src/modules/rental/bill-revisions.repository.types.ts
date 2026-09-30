import type { RentalBillLine } from "@xpense/shared";
import type { rentalBillRevisions, rentalBills } from "../../db/schema.js";

export type BillRevisionRecord = typeof rentalBillRevisions.$inferSelect;
export type BillRevisionBillRecord = typeof rentalBills.$inferSelect;
export type BillRevisionActor = { userId: string };
export type BillRevisionPage = { page: number; pageSize: number };
export type BillRevisionHistory = {
  items: BillRevisionRecord[];
  total: number;
  page: number;
  pageSize: number;
};
export type BillRevisionAppendResult = {
  bill: BillRevisionBillRecord;
  revision: BillRevisionRecord;
};
export type BillRevisionLinesInput = RentalBillLine[];
