import type { RentalPropertyUnpaidBill } from "@xpense/shared";
import type { PropertyBillingSource } from "./property-billing.rules.js";
export type PropertyBillingScanInput = {
  organizationId: string;
  propertyId: string;
  now: string;
  timezone: string;
  afterContractId?: string;
  pageSize: number;
};
export type PropertyBillingScan = {
  sources: PropertyBillingSource[];
  unpaidBills: RentalPropertyUnpaidBill[];
  nextAfterContractId: string | null;
};
