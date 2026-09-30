import { describe, expect, it } from "vitest";

import { ROUTE_DEFINITIONS } from "./menu.js";
import { permissionKeys } from "./rbac.js";
import {
  rentalBillDueStates,
  rentalBillLineKinds,
  rentalBillStatuses,
  rentalBillTypes,
} from "./rental-bills.js";

describe("租赁应收共享契约", () => {
  it("保留 legacy 应收类型并增加月度综合账单", () => {
    expect(rentalBillTypes).toEqual(["rent", "deposit", "monthly"]);
    expect(rentalBillLineKinds).toEqual([
      "rent_period",
      "deposit",
      "termination_adjustment",
      "water",
      "electricity",
      "fixed_fee",
      "extra_fee",
    ]);
    expect(rentalBillStatuses).toEqual(["active", "voided"]);
    expect(rentalBillDueStates).toEqual(["upcoming", "due_today", "date_passed"]);
  });

  it("登记查询路由和三项独立权限", () => {
    expect(ROUTE_DEFINITIONS.RentalBills.path).toBe("/rentals/bills");
    expect(ROUTE_DEFINITIONS.RentalBillDetail.path).toBe("/rentals/bills/$billId");
    expect(permissionKeys).toEqual(
      expect.arrayContaining(["rental_bills:read", "rental_bills:generate", "rental_bills:adjust"]),
    );
  });

  it("声明独立的月度收费与收退款权限", () => {
    expect(permissionKeys).toEqual(
      expect.arrayContaining([
        "rental_charges:read",
        "rental_charges:update",
        "rental_meters:read",
        "rental_meters:update",
        "rental_monthly_bills:generate",
        "rental_monthly_bills:adjust",
        "rental_receipts:create",
        "rental_receipts:revoke",
        "rental_refunds:create",
        "rental_refunds:revoke",
        "rental_settlements:read",
        "rental_settlements:confirm",
      ]),
    );
  });
});
