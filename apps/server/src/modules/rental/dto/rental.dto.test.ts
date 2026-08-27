import { describe, expect, it } from "vitest";

import { batchCreateRentalSpacesSchema } from "./batch-create-spaces.dto.js";
import { createRentalPropertySchema } from "./create-property.dto.js";
import { createRentalSpaceSchema } from "./create-space.dto.js";
import { deletePropertySchema } from "./delete-property.dto.js";
import { deleteSpaceSchema } from "./delete-space.dto.js";
import { listPropertiesSchema } from "./list-properties.dto.js";
import { listSpaceChildrenSchema } from "./list-space-children.dto.js";
import { moveRentalSpaceSchema } from "./move-space.dto.js";
import { propertyDetailSchema } from "./property-detail.dto.js";
import { searchSpacesSchema } from "./search-spaces.dto.js";
import { setPropertyStatusSchema } from "./set-property-status.dto.js";
import { setSpaceStatusSchema } from "./set-space-status.dto.js";
import { updateRentalPropertySchema } from "./update-property.dto.js";
import { updateRentalSpaceSchema } from "./update-space.dto.js";

const ledgerId = "123e4567-e89b-12d3-a456-426614174000";
const propertyId = "223e4567-e89b-12d3-a456-426614174000";
const spaceId = "323e4567-e89b-12d3-a456-426614174000";

describe("rental DTO schemas", () => {
  it("normalizes and validates property creation", () => {
    expect(
      createRentalPropertySchema.parse({
        name: "  仓库  ",
        type: "warehouse",
        countryCode: " CN ",
        province: "  江苏  ",
        addressLine: " 工业路 1 号 ",
      }),
    ).toEqual({
      name: "仓库",
      type: "warehouse",
      countryCode: "CN",
      province: "江苏",
      addressLine: "工业路 1 号",
    });
    expect(
      createRentalPropertySchema.parse({
        name: "自建房",
        type: "other",
        customTypeName: "  自建房屋  ",
        countryCode: "CN",
        addressLine: "南街 1 号",
      }).customTypeName,
    ).toBe("自建房屋");
    expect(
      createRentalPropertySchema.parse({
        name: "默认国家",
        type: "warehouse",
        addressLine: "工业路 1 号",
      }).countryCode,
    ).toBe("CN");
    expect(() =>
      createRentalPropertySchema.parse({
        name: "仓库",
        type: "warehouse",
        countryCode: "CN",
        addressLine: "工业路 1 号",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      createRentalPropertySchema.parse({
        name: "仓库",
        type: "other",
        countryCode: "CN",
        addressLine: "工业路 1 号",
      }),
    ).toThrow();
    expect(() =>
      createRentalPropertySchema.parse({
        name: "仓库",
        type: "warehouse",
        customTypeName: "仓",
        countryCode: "CN",
        addressLine: "工业路 1 号",
      }),
    ).toThrow();
    expect(() =>
      createRentalPropertySchema.parse({
        name: "仓库",
        type: "warehouse",
        countryCode: "cn",
        addressLine: "工业路 1 号",
      }),
    ).toThrow();
    expect(() =>
      createRentalPropertySchema.parse({
        ledgerId,
        name: "仓库",
        type: "warehouse",
        countryCode: "CN",
        addressLine: "工业路 1 号",
      }),
    ).toThrow();
  });

  it("validates property query, detail, status and delete inputs", () => {
    expect(listPropertiesSchema.parse({ page: "2", pageSize: "100", isActive: "false" })).toEqual({
      page: 2,
      pageSize: 100,
      isActive: false,
    });
    expect(listPropertiesSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(() => listPropertiesSchema.parse({ page: 0 })).toThrow();
    expect(() => listPropertiesSchema.parse({ pageSize: 101 })).toThrow();
    expect(propertyDetailSchema.parse({ id: propertyId })).toEqual({ id: propertyId });
    expect(setPropertyStatusSchema.parse({ id: propertyId, isActive: false })).toEqual({
      id: propertyId,
      isActive: false,
    });
    expect(deletePropertySchema.parse({ id: propertyId })).toEqual({ id: propertyId });
    expect(() =>
      deletePropertySchema.parse({ id: propertyId, organizationId: ledgerId }),
    ).toThrow();
  });

  it("limits property updates to mutable fields and requires one field", () => {
    expect(updateRentalPropertySchema.parse({ id: propertyId, name: "  新名称  " })).toEqual({
      id: propertyId,
      name: "新名称",
    });
    expect(updateRentalPropertySchema.parse({ id: propertyId, customTypeName: null })).toEqual({
      id: propertyId,
      customTypeName: null,
    });
    expect(() => updateRentalPropertySchema.parse({ id: propertyId })).toThrow();
    expect(() => updateRentalPropertySchema.parse({ id: propertyId, ledgerId })).toThrow();
    expect(() => updateRentalPropertySchema.parse({ id: propertyId, isActive: false })).toThrow();
  });

  it("normalizes and validates space creation and batch creation", () => {
    expect(
      createRentalSpaceSchema.parse({
        propertyId,
        name: "  101  ",
        code: " A-01 ",
        type: "room",
        isRentable: true,
      }),
    ).toEqual({
      propertyId,
      name: "101",
      code: "A-01",
      type: "room",
      isRentable: true,
    });
    expect(() =>
      createRentalSpaceSchema.parse({
        propertyId,
        name: "101",
        type: "other",
        isRentable: true,
      }),
    ).toThrow();
    expect(() =>
      createRentalSpaceSchema.parse({
        propertyId,
        name: "101",
        type: "room",
        isRentable: true,
        sortOrder: "1",
      }),
    ).toThrow();
    expect(() =>
      createRentalSpaceSchema.parse({
        propertyId,
        name: "101",
        type: "room",
        isRentable: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
    expect(
      batchCreateRentalSpacesSchema.parse({
        propertyId,
        type: "room",
        isRentable: true,
        items: [{ name: " 101 ", code: " A " }, { name: "102" }],
      }),
    ).toEqual({
      propertyId,
      type: "room",
      isRentable: true,
      items: [{ name: "101", code: "A" }, { name: "102" }],
    });
    expect(() =>
      batchCreateRentalSpacesSchema.parse({
        propertyId,
        type: "room",
        isRentable: true,
        items: [],
      }),
    ).toThrow();
    expect(() =>
      batchCreateRentalSpacesSchema.parse({
        propertyId,
        type: "room",
        isRentable: true,
        items: Array.from({ length: 501 }, (_, i) => ({ name: String(i) })),
      }),
    ).toThrow();
  });

  it("validates space query and mutation DTOs", () => {
    expect(listSpaceChildrenSchema.parse({ propertyId, parentId: null, page: "1" })).toEqual({
      propertyId,
      parentId: null,
      page: 1,
      pageSize: 20,
    });
    expect(searchSpacesSchema.parse({ propertyId, keyword: " 101 ", pageSize: "100" })).toEqual({
      propertyId,
      keyword: "101",
      page: 1,
      pageSize: 100,
    });
    expect(updateRentalSpaceSchema.parse({ id: spaceId, name: "新名称" })).toEqual({
      id: spaceId,
      name: "新名称",
    });
    expect(() => updateRentalSpaceSchema.parse({ id: spaceId })).toThrow();
    expect(() =>
      updateRentalSpaceSchema.parse({ id: spaceId, organizationId: ledgerId }),
    ).toThrow();
    expect(moveRentalSpaceSchema.parse({ id: spaceId, parentId: null, sortOrder: 3 })).toEqual({
      id: spaceId,
      parentId: null,
      sortOrder: 3,
    });
    expect(setSpaceStatusSchema.parse({ id: spaceId, isActive: true })).toEqual({
      id: spaceId,
      isActive: true,
    });
    expect(deleteSpaceSchema.parse({ id: spaceId })).toEqual({ id: spaceId });
  });
});
