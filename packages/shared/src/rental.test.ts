import { describe, expect, it } from "vitest";

import type {
  CreateRentalPropertyRequest,
  DeleteRentalPropertyRequest,
  SetRentalPropertyStatusRequest,
  UpdateRentalPropertyRequest,
} from "./rental.js";
import { rentalPropertyTypes, rentalSpaceTypes } from "./rental.js";

describe("rental contracts", () => {
  it("keeps the phase-one vocabularies stable", () => {
    expect(rentalPropertyTypes).toEqual([
      "residential_unit",
      "detached_house",
      "apartment_building",
      "commercial_building",
      "complex",
      "shop",
      "office",
      "warehouse",
      "other",
    ]);
    expect(rentalSpaceTypes).toEqual([
      "building",
      "floor",
      "unit",
      "room",
      "shop",
      "office",
      "parking_space",
      "warehouse",
      "other",
    ]);
  });

  it("keeps companion ledger identity server-generated", () => {
    const request = {
      name: "阳光公寓",
      type: "apartment_building",
      countryCode: "CN",
      addressLine: "科技园 1 号",
    } satisfies CreateRentalPropertyRequest;

    expect(request).not.toHaveProperty("ledgerId");
  });

  it("keeps property profile, status, and deletion requests separated", () => {
    const update = {
      id: "property-1",
      name: "阳光公寓二期",
    } satisfies UpdateRentalPropertyRequest;
    const status = {
      id: "property-1",
      isActive: false,
    } satisfies SetRentalPropertyStatusRequest;
    const remove = { id: "property-1" } satisfies DeleteRentalPropertyRequest;
    const noStatusField: Record<Extract<keyof UpdateRentalPropertyRequest, "isActive">, never> = {};
    // @ts-expect-error 房产资料更新必须至少提供一个可变字段。
    const emptyUpdate: UpdateRentalPropertyRequest = { id: "property-1" };
    // @ts-expect-error 房产启停必须使用独立状态请求。
    const statusInUpdate: UpdateRentalPropertyRequest = { id: "property-1", isActive: false };

    expect(update).toEqual({ id: "property-1", name: "阳光公寓二期" });
    expect(status).toEqual({ id: "property-1", isActive: false });
    expect(remove).toEqual({ id: "property-1" });
    expect(noStatusField).toEqual({});
    expect([emptyUpdate, statusInUpdate]).toHaveLength(2);
  });
});
