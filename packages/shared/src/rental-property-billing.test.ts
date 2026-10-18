import { expect, it } from "vitest";
import { rentalPropertyBillingPermissions } from "./rental-property-billing.js";

it("房产出账需要房产、空间、合同、账单读取与出账权限", () => {
  expect(rentalPropertyBillingPermissions).toEqual([
    "rental_properties:read",
    "rental_spaces:read",
    "rental_contracts:read",
    "rental_bills:read",
    "rental_period_bills:generate",
  ]);
});
