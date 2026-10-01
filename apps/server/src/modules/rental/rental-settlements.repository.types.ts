import type { RentalSettlementKind, RentalSettlementStatus } from "@xpense/shared";
import type {
  rentalSettlementBills,
  rentalSettlementRevisions,
  rentalSettlements,
} from "../../db/schema.js";
import type { SettlementPlan } from "./rental-finance.types.js";

export type RentalSettlementRecord = typeof rentalSettlements.$inferSelect;
export type RentalSettlementRevisionRecord = typeof rentalSettlementRevisions.$inferSelect;
export type RentalSettlementBillRecord = typeof rentalSettlementBills.$inferSelect;
export type RentalSettlementActor = { userId: string };
export type RentalSettlementEvent = {
  /** 仅由服务端预分配；客户端请求不能选择结算 ID。 */
  settlementId?: string;
  eventId: string;
  kind: RentalSettlementKind;
  status: RentalSettlementStatus;
  version: string;
};
export type RentalSettlementProjection = {
  plan: SettlementPlan;
  status: RentalSettlementStatus;
  version: string;
  reason?: string | null;
};
export type RentalSettlementPage = { page: number; pageSize: number };
export type RentalSettlementHistory = {
  items: RentalSettlementRevisionRecord[];
  total: number;
  page: number;
  pageSize: number;
};
