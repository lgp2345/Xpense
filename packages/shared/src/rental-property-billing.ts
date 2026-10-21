import type { RentalBillSummary } from "./rental-bills.js";
import type { RentalBillingPeriod } from "./rental-period-bills.js";

export const rentalPropertyBillingPermissions = [
  "rental_properties:read",
  "rental_spaces:read",
  "rental_contracts:read",
  "rental_bills:read",
  "rental_period_bills:generate",
] as const;
export type RentalBillingSpacePathNode = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
};
export type RentalPropertyBillingCandidate = {
  contractId: string;
  contractNumber: string;
  spaceId: string;
  path: RentalBillingSpacePathNode[];
  tenantNames: string[];
  period: RentalBillingPeriod;
  daysUntilStart: number;
};
export type RentalPropertyUnpaidBill = {
  bill: RentalBillSummary;
  spaceId: string;
  path: RentalBillingSpacePathNode[];
  tenantNames: string[];
};
export type ListRentalPropertyBillingQuery = {
  propertyId: string;
  afterContractId?: string;
  pageSize?: number;
};
export type RentalPropertyBillingPage = {
  property: { id: string; name: string };
  today: string;
  timezone: string;
  items: RentalPropertyBillingCandidate[];
  unpaidBills: RentalPropertyUnpaidBill[];
  nextAfterContractId: string | null;
};
