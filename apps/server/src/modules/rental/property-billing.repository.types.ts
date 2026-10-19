import type { PropertyBillingSource } from "./property-billing.rules.js";
export type PropertyBillingScanInput = {
  organizationId: string;
  propertyId: string;
  now: string;
  afterContractId?: string;
  pageSize: number;
};
export type PropertyBillingScan = {
  sources: PropertyBillingSource[];
  nextAfterContractId: string | null;
};
