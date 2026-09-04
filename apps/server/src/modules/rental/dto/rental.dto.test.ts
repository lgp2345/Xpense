import { describe, expect, it } from "vitest";

import { batchCreateRentalSpacesSchema } from "./batch-create-spaces.dto.js";
import { changeContractPartiesSchema } from "./change-contract-parties.dto.js";
import { checkContractAvailabilitySchema } from "./check-contract-availability.dto.js";
import {
  cancelContractSchema,
  confirmContractSchema,
  deleteContractSchema,
  renewContractSchema,
  revokeContractTerminationSchema,
} from "./contract-action.dto.js";
import { contractDetailSchema } from "./contract-detail.dto.js";
import { createContractSchema } from "./create-contract.dto.js";
import { createRentalPropertySchema } from "./create-property.dto.js";
import { createRentalSpaceSchema } from "./create-space.dto.js";
import { createTenantSchema } from "./create-tenant.dto.js";
import { deletePropertySchema } from "./delete-property.dto.js";
import { deleteSpaceSchema } from "./delete-space.dto.js";
import { deleteTenantSchema } from "./delete-tenant.dto.js";
import { listContractsSchema } from "./list-contracts.dto.js";
import { listPropertiesSchema } from "./list-properties.dto.js";
import { listSpaceChildrenSchema } from "./list-space-children.dto.js";
import { listTenantsSchema } from "./list-tenants.dto.js";
import { moveRentalSpaceSchema } from "./move-space.dto.js";
import { propertyDetailSchema } from "./property-detail.dto.js";
import { revealContractPartySensitiveSchema } from "./reveal-contract-party-sensitive.dto.js";
import { revealTenantSensitiveSchema } from "./reveal-tenant-sensitive.dto.js";
import { searchSpacesSchema } from "./search-spaces.dto.js";
import { setPropertyStatusSchema } from "./set-property-status.dto.js";
import { setSpaceStatusSchema } from "./set-space-status.dto.js";
import { setTenantStatusSchema } from "./set-tenant-status.dto.js";
import { spaceSubtreeDepthSchema } from "./space-subtree-depth.dto.js";
import { tenantDetailSchema } from "./tenant-detail.dto.js";
import { terminateContractSchema } from "./terminate-contract.dto.js";
import { updateContractSchema } from "./update-contract.dto.js";
import { updateRentalPropertySchema } from "./update-property.dto.js";
import { updateRentalSpaceSchema } from "./update-space.dto.js";
import { updateTenantSchema } from "./update-tenant.dto.js";

const ledgerId = "123e4567-e89b-12d3-a456-426614174000";
const propertyId = "223e4567-e89b-12d3-a456-426614174000";
const spaceId = "323e4567-e89b-12d3-a456-426614174000";
const tenantId = "423e4567-e89b-12d3-a456-426614174000";
const tenantId2 = "523e4567-e89b-12d3-a456-426614174000";
const spaceId2 = "623e4567-e89b-12d3-a456-426614174000";
const contractId = "723e4567-e89b-12d3-a456-426614174000";

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

  it("requires a property-scoped space ID when reading subtree depth", () => {
    expect(spaceSubtreeDepthSchema.parse({ propertyId, id: spaceId })).toEqual({
      propertyId,
      id: spaceId,
    });
    expect(() => spaceSubtreeDepthSchema.parse({ propertyId })).toThrow();
    expect(() =>
      spaceSubtreeDepthSchema.parse({ propertyId, id: spaceId, organizationId: ledgerId }),
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

  it("normalizes and validates tenant creation without accepting internal fields", () => {
    expect(
      createTenantSchema.parse({
        type: "individual",
        name: " 张三 ",
        phone: "   ",
        primaryContactName: "联系人",
        primaryContactPhone: "13800000000",
        documentCountryCode: " CN ",
        documentType: "national_id",
        documentNumber: " 110101 19900101 1234 ",
        birthDate: "1990-01-01",
        gender: "male",
        ethnicity: " 汉 ",
      }),
    ).toMatchObject({
      type: "individual",
      name: "张三",
      phone: undefined,
      primaryContactName: "联系人",
      primaryContactPhone: "13800000000",
      documentCountryCode: "CN",
      documentNumber: " 110101 19900101 1234 ",
      ethnicity: "汉",
    });
    expect(() => createTenantSchema.parse({ type: "individual", name: "张三" })).not.toThrow();
    expect(() =>
      createTenantSchema.parse({
        type: "individual",
        name: "张三",
        documentNumber: "110101199001011234",
        documentType: "national_id",
      }),
    ).toThrow();
    expect(() =>
      createTenantSchema.parse({
        type: "company",
        name: "星海公司",
        birthDate: "1990-01-01",
      }),
    ).toThrow();
    expect(() =>
      createTenantSchema.parse({
        type: "company",
        name: "星海公司",
        primaryContactName: "王经理",
      }),
    ).toThrow("企业租户必须填写联系人姓名和联系人电话");
    expect(() =>
      createTenantSchema.parse({
        type: "company",
        name: "星海公司",
        primaryContactName: "王经理",
        primaryContactPhone: "13800000000",
      }),
    ).not.toThrow();
    expect(() =>
      createTenantSchema.parse({
        type: "individual",
        name: "张三",
        organizationId: ledgerId,
      }),
    ).toThrow();
    expect(() =>
      createTenantSchema.parse({
        type: "individual",
        name: "张三",
        createdByUserId: tenantId,
        documentNumberLookupHash: "hash",
        sensitiveIdentityCiphertext: "ciphertext",
      }),
    ).toThrow();
  });

  it("validates tenant mutation, query and scoped action DTOs", () => {
    expect(() => updateTenantSchema.parse({ id: tenantId, note: "   " })).toThrow();
    expect(() => updateTenantSchema.parse({ id: tenantId })).toThrow();
    expect(() => updateTenantSchema.parse({ id: tenantId, name: null })).toThrow();
    expect(listTenantsSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(listTenantsSchema.parse({ keyword: "  张三  ", page: "2" })).toEqual({
      keyword: "张三",
      page: 2,
      pageSize: 20,
    });
    expect(() => listTenantsSchema.parse({ page: 0 })).toThrow();
    expect(() => listTenantsSchema.parse({ organizationId: ledgerId })).toThrow();
    expect(tenantDetailSchema.parse({ id: tenantId })).toEqual({ id: tenantId });
    expect(setTenantStatusSchema.parse({ id: tenantId, isActive: false })).toEqual({
      id: tenantId,
      isActive: false,
    });
    expect(deleteTenantSchema.parse({ id: tenantId })).toEqual({ id: tenantId });
    expect(revealTenantSensitiveSchema.parse({ id: tenantId })).toEqual({ id: tenantId });
    expect(() =>
      revealTenantSensitiveSchema.parse({ id: tenantId, updatedByUserId: tenantId }),
    ).toThrow();
  });

  it("validates contract list/detail/availability inputs without internal scope fields", () => {
    expect(listContractsSchema.parse({ keyword: "  C-001  ", page: "2" })).toEqual({
      keyword: "C-001",
      page: 2,
      pageSize: 20,
    });
    expect(() => listContractsSchema.parse({ status: "confirmed" })).toThrow();
    expect(() => listContractsSchema.parse({ organizationId: ledgerId })).toThrow();
    expect(contractDetailSchema.parse({ id: contractId })).toEqual({ id: contractId });
    expect(
      checkContractAvailabilitySchema.parse({
        propertyId,
        spaceIds: [spaceId, spaceId2],
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toEqual({
      propertyId,
      spaceIds: [spaceId, spaceId2],
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(() =>
      checkContractAvailabilitySchema.parse({
        propertyId,
        spaceIds: [spaceId, spaceId],
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toThrow();
    expect(() =>
      checkContractAvailabilitySchema.parse({
        propertyId,
        spaceIds: [spaceId],
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      }),
    ).toThrow();
  });

  it("validates strict contract drafts and aggregate relationships", () => {
    const validDraft = {
      propertyId,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      rentAmountMinor: 300_000,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 1,
      dueDaysBefore: 5,
      parties: [
        { tenantId, isPrimaryPayer: true },
        { tenantId: tenantId2, isPrimaryPayer: false },
      ],
      spaces: [
        { spaceId, rentAllocationMinor: 100_000 },
        { spaceId: spaceId2, rentAllocationMinor: 200_000 },
      ],
      depositTerms: [
        {
          type: "rental",
          calculationMode: "rent_multiple",
          rentMultiple: "1.5000",
        },
      ],
      note: "  年租合同  ",
    };

    expect(createContractSchema.parse(validDraft)).toMatchObject({
      propertyId,
      note: "年租合同",
      rentAmountMinor: 300_000,
    });
    expect(() => createContractSchema.parse({ ...validDraft, organizationId: ledgerId })).toThrow();
    expect(() =>
      createContractSchema.parse({ ...validDraft, createdByUserId: tenantId }),
    ).toThrow();
    expect(() =>
      createContractSchema.parse({
        ...validDraft,
        parties: [
          { tenantId, isPrimaryPayer: true },
          { tenantId, isPrimaryPayer: false },
        ],
      }),
    ).toThrow();
    expect(() =>
      createContractSchema.parse({
        ...validDraft,
        parties: [
          { tenantId, isPrimaryPayer: true },
          { tenantId: tenantId2, isPrimaryPayer: true },
        ],
      }),
    ).toThrow();
    expect(() =>
      createContractSchema.parse({
        ...validDraft,
        spaces: [{ spaceId, rentAllocationMinor: 100_000 }, { spaceId: spaceId2 }],
      }),
    ).toThrow();
    expect(() =>
      createContractSchema.parse({
        ...validDraft,
        depositTerms: [
          {
            type: "rental",
            calculationMode: "fixed_amount",
            fixedAmountMinor: 50_000,
            rentMultiple: "1",
          },
        ],
      }),
    ).toThrow();
    expect(() => createContractSchema.parse({ ...validDraft, rentAmountMinor: 1.5 })).toThrow();
    expect(() =>
      createContractSchema.parse({ ...validDraft, rentAmountMinor: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
  });

  it("limits contract updates to mutable fields and validates supplied collections", () => {
    expect(updateContractSchema.parse({ id: contractId, note: null })).toEqual({
      id: contractId,
      note: null,
    });
    expect(() => updateContractSchema.parse({ id: contractId })).toThrow();
    expect(() => updateContractSchema.parse({ id: contractId, status: "confirmed" })).toThrow();
    expect(() => updateContractSchema.parse({ id: contractId, updatedAt: "2026-01-01" })).toThrow();
    expect(() =>
      updateContractSchema.parse({
        id: contractId,
        spaces: [{ spaceId }, { spaceId }],
      }),
    ).toThrow();
    expect(() =>
      updateContractSchema.parse({
        id: contractId,
        spaces: [
          { spaceId, rentAllocationMinor: 100_000 },
          { spaceId: spaceId2, rentAllocationMinor: 200_000 },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      updateContractSchema.parse({
        id: contractId,
        depositTerms: [
          {
            type: "other",
            calculationMode: "fixed_amount",
            fixedAmountMinor: 100,
          },
        ],
      }),
    ).toThrow();
  });

  it("keeps contract lifecycle actions strict and state-specific", () => {
    expect(confirmContractSchema.parse({ id: contractId })).toEqual({ id: contractId });
    expect(cancelContractSchema.parse({ id: contractId, reason: "  双方取消  " })).toEqual({
      id: contractId,
      reason: "双方取消",
    });
    expect(
      revokeContractTerminationSchema.parse({ id: contractId, reason: "  继续履约  " }),
    ).toEqual({
      id: contractId,
      reason: "继续履约",
    });
    expect(renewContractSchema.parse({ id: contractId })).toEqual({ id: contractId });
    expect(deleteContractSchema.parse({ id: contractId })).toEqual({ id: contractId });
    expect(() => confirmContractSchema.parse({ id: contractId, reason: "不应接受" })).toThrow();
    expect(() => cancelContractSchema.parse({ id: contractId })).toThrow();
    expect(() =>
      renewContractSchema.parse({ id: contractId, effectiveDate: "2027-01-01" }),
    ).toThrow();
    expect(() =>
      deleteContractSchema.parse({ id: contractId, deletedByUserId: tenantId }),
    ).toThrow();
  });

  it("validates party change, termination and historical-sensitive reveal actions", () => {
    expect(
      changeContractPartiesSchema.parse({
        id: contractId,
        effectiveDate: "2026-06-01",
        reason: "  法定代表人变更  ",
        parties: [
          { tenantId, isPrimaryPayer: true },
          { tenantId: tenantId2, isPrimaryPayer: false },
        ],
      }),
    ).toMatchObject({
      id: contractId,
      effectiveDate: "2026-06-01",
      reason: "法定代表人变更",
    });
    expect(() =>
      changeContractPartiesSchema.parse({
        id: contractId,
        effectiveDate: "2026-06-01",
        reason: "变更付款人",
        parties: [{ tenantId, isPrimaryPayer: false }],
      }),
    ).toThrow();
    expect(() =>
      changeContractPartiesSchema.parse({
        id: contractId,
        effectiveDate: "2026-06-01",
        parties: [{ tenantId, isPrimaryPayer: true }],
      }),
    ).toThrow();
    expect(() =>
      changeContractPartiesSchema.parse({
        id: contractId,
        effectiveDate: "2026-06-01",
        reason: "   ",
        parties: [{ tenantId, isPrimaryPayer: true }],
      }),
    ).toThrow();
    expect(() =>
      changeContractPartiesSchema.parse({
        id: contractId,
        effectiveDate: "2026-06-01",
        reason: "变".repeat(1001),
        parties: [{ tenantId, isPrimaryPayer: true }],
      }),
    ).toThrow();
    expect(() =>
      changeContractPartiesSchema.parse({
        id: contractId,
        effectiveDate: "2026-06-01",
        reason: "变更付款人",
        parties: [{ tenantId, isPrimaryPayer: true }],
        organizationId: ledgerId,
      }),
    ).toThrow();
    expect(
      terminateContractSchema.parse({
        id: contractId,
        terminationDate: "2026-10-15",
        reason: " 提前退租 ",
      }),
    ).toEqual({
      id: contractId,
      terminationDate: "2026-10-15",
      reason: "提前退租",
    });
    expect(() =>
      terminateContractSchema.parse({
        id: contractId,
        terminationDate: "2026-10-15",
        cancellationReason: "错误字段",
      }),
    ).toThrow();
    expect(
      revealContractPartySensitiveSchema.parse({
        contractId,
        tenantId,
        validFrom: "2026-01-01",
      }),
    ).toEqual({ contractId, tenantId, validFrom: "2026-01-01" });
    expect(() =>
      revealContractPartySensitiveSchema.parse({
        contractId,
        tenantId,
        validFrom: "2026-01-01",
        organizationId: ledgerId,
      }),
    ).toThrow();
  });

  it("rejects year zero and malformed Gregorian dates at every contract DTO boundary", () => {
    expect(() => createContractSchema.parse({ propertyId, startDate: "0000-01-01" })).toThrow();
    expect(() => updateContractSchema.parse({ id: contractId, endDate: "2026-02-29" })).toThrow();
    expect(() => listContractsSchema.parse({ startDateFrom: "2026-1-01" })).toThrow();
    expect(() => listContractsSchema.parse({ endDateTo: "0000-12-31" })).toThrow();
    expect(() =>
      checkContractAvailabilitySchema.parse({
        propertyId,
        spaceIds: [spaceId],
        startDate: "0000-01-01",
        endDate: "2026-12-31",
      }),
    ).toThrow();
    expect(() =>
      changeContractPartiesSchema.parse({
        id: contractId,
        effectiveDate: "0000-06-01",
        reason: "变更付款人",
        parties: [{ tenantId, isPrimaryPayer: true }],
      }),
    ).toThrow();
    expect(() =>
      terminateContractSchema.parse({
        id: contractId,
        terminationDate: "0000-10-15",
        reason: "提前退租",
      }),
    ).toThrow();
    expect(() =>
      revealContractPartySensitiveSchema.parse({
        contractId,
        tenantId,
        validFrom: "0000-01-01",
      }),
    ).toThrow();
  });
});
