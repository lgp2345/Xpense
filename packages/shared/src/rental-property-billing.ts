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
  spaceId: string;
  path: RentalBillingSpacePathNode[];
  tenantNames: string[];
  period: RentalBillingPeriod;
  daysUntilStart: number;
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
  nextAfterContractId: string | null;
};
