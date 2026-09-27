import { describe, expect, it } from "vitest";

import { ROUTE_DEFINITIONS } from "./menu.js";
import { permissionKeys } from "./rbac.js";
import { rentalBillDueStates, rentalBillStatuses, rentalBillTypes } from "./rental-bills.js";

describe("租赁应收共享契约", () => {
  it("仅定义应收类型、有效状态和日期提示", () => {
    expect(rentalBillTypes).toEqual(["rent", "deposit"]);
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
});
