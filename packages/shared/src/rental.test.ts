import { describe, expect, it } from "vitest";

import type {
  CreateRentalPropertyRequest,
  DeleteRentalPropertyRequest,
  RentalPropertyDetail,
  RentalSpaceNode,
  SetRentalPropertyStatusRequest,
  UpdateRentalPropertyRequest,
  UpdateRentalSpaceRequest,
} from "./rental.js";
import { rentalPropertyTypes, rentalSpaceTypes } from "./rental.js";

const propertyDetailContract = {
  id: "property-1",
  ledgerId: "ledger-1",
  name: "阳光公寓",
  type: "apartment_building",
  customTypeName: null,
  countryCode: "CN",
  province: null,
  city: "深圳",
  district: null,
  addressLine: "科技园 1 号",
  isActive: true,
  spaceCount: 3,
  rentableSpaceCount: 2,
  updatedAt: "2026-08-30T00:00:00.000Z",
  note: null,
  createdAt: "2026-08-30T00:00:00.000Z",
  activeContractCount: 1,
  upcomingContractCount: 1,
  expiringSoonContractCount: 0,
} satisfies RentalPropertyDetail;

const spaceNodeContract = {
  id: "space-1",
  propertyId: "property-1",
  parentId: null,
  name: "101",
  code: null,
  type: "unit",
  customTypeName: null,
  isRentable: true,
  isActive: true,
  note: null,
  isEffectivelyActive: true,
  sortOrder: 0,
  hasChildren: false,
  leaseStatus: "vacant",
  leaseBlockedReason: null,
  hasUpcomingContract: false,
} satisfies RentalSpaceNode;

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

  it("keeps space profile updates partial and excludes status", () => {
    const update = { id: "space-1", note: null } satisfies UpdateRentalSpaceRequest;
    const partialUpdate = { id: "space-1" } satisfies UpdateRentalSpaceRequest;
    // @ts-expect-error 空间启停必须使用独立状态请求。
    const statusInUpdate: UpdateRentalSpaceRequest = { id: "space-1", isActive: false };

    expect(update).toEqual({ id: "space-1", note: null });
    expect(partialUpdate).toEqual({ id: "space-1" });
    expect(statusInUpdate).toEqual({ id: "space-1", isActive: false });
  });

  it("includes contract counters and derived lease state in rental responses", () => {
    expect(propertyDetailContract.activeContractCount).toBe(1);
    expect(propertyDetailContract.upcomingContractCount).toBe(1);
    expect(propertyDetailContract.expiringSoonContractCount).toBe(0);
    expect(spaceNodeContract.leaseStatus).toBe("vacant");
    expect(spaceNodeContract.leaseBlockedReason).toBeNull();
    expect(spaceNodeContract.hasUpcomingContract).toBe(false);
  });
});
