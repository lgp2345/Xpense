import type { RentalContractDetail, RentalPropertyDetail } from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { login, parseJson, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import {
  bookkeepingTestIds,
  cloneBookkeepingTestState,
} from "../../test/bookkeeping-test-state.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-harness.js";
import { FIXED_RENTAL_NOW } from "../../test/rental-test-state.js";
import type {
  RentalContractDetailRecord,
  RentalContractRecord,
} from "./contracts.repository.types.js";
import type { RentalPropertyRecord } from "./properties.repository.types.js";
import type { RentalSpaceRecord } from "./spaces.repository.types.js";
import { TenantIdentityCryptoService } from "./tenant-identity-crypto.service.js";

type InjectResponse = { payload: string; statusCode: number };

const propertyPayload = {
  name: "阳光公寓",
  type: "other",
  customTypeName: "长租公寓",
  countryCode: "CN",
  province: "广东",
  city: "深圳",
  district: "南山",
  addressLine: "科技园 1 号",
  note: "朝南",
} as const;

const generatedPropertyId = "88888888-8888-4888-8888-000000000001";
const generatedSpaceId = "99999999-9999-4999-8999-000000000001";
const generatedSecondSpaceId = "99999999-9999-4999-8999-000000000002";
const generatedTenantId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const generatedContractId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const adminUserId = "11111111-1111-4111-8111-111111111106";

function registerContractDetail(
  setup: TestAppHarness,
  id: string,
  propertyId: string = rentalTestIds.property,
  contractNumber = "RC-2026-000001",
  dates: { startDate?: string | null; endDate?: string | null } = {},
  relationIds: { tenantId?: string; spaceId?: string } = {},
  options: {
    lifecycleStatus?: string;
    displayStatus?: string;
    note?: string | null;
    tenantNames?: string[];
    spaceNames?: string[];
  } = {},
): void {
  const contract = setup.state.rental.contracts.get(id) ?? null;
  setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], contract);
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, id],
    contract,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.detail",
    [testIds.organization, id, "2026-08-31"],
    {
      id,
      propertyId,
      contractNumber,
      externalContractNumber: null,
      startDate: dates.startDate ?? null,
      endDate: dates.endDate ?? null,
      rentAmountMinor: 10000,
      updatedAt: new Date(FIXED_RENTAL_NOW),
      propertyName: "测试房产",
      lifecycleStatus: options.lifecycleStatus ?? "draft",
      displayStatus: options.displayStatus ?? "draft",
      actualEndDate: dates.endDate ?? null,
      tenantNames: options.tenantNames ?? [],
      spaceNames: options.spaceNames ?? [],
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      hasScheduledTermination: false,
      renewedFromContractId: null,
      cancellationReason: null,
      terminationDate: null,
      terminationReason: null,
      note: options.note ?? null,
      spaces: relationIds.spaceId
        ? [
            {
              spaceId: relationIds.spaceId,
              spaceName: "测试空间",
              spaceCode: null,
              spacePath: [{ id: relationIds.spaceId, name: "测试空间" }],
              rentAllocationMinor: null,
            },
          ]
        : [],
      parties: relationIds.tenantId
        ? [
            {
              tenantId: relationIds.tenantId,
              tenantType: "individual",
              tenantName: "测试租户",
              phone: "13800000001",
              email: "tenant@example.com",
              primaryContactName: null,
              documentCountryCode: "CN",
              documentType: "national_id",
              documentTypeOtherName: null,
              maskedDocumentNumber: null,
              validFrom: dates.startDate ?? null,
              validTo: dates.endDate ?? null,
              isPrimaryPayer: true,
            },
          ]
        : [],
      depositTerms: [],
      createdAt: new Date(FIXED_RENTAL_NOW),
    },
  );
  if (relationIds.spaceId) {
    setup.state.rentalMutation.registerMutation(
      "relations.replaceDraftSpaces",
      {
        organizationId: testIds.organization,
        contractId: id,
        propertyId,
        spaces: [{ spaceId: relationIds.spaceId }],
      },
      {
        contractSpaces: {
          contractId: id,
          rows: [
            {
              spaceId: relationIds.spaceId,
              spaceName: "测试空间",
              spaceCode: null,
              spacePath: [{ id: relationIds.spaceId, name: "测试空间" }],
              rentAllocationMinor: null,
            },
          ],
        },
      },
    );
  }
  if (relationIds.tenantId) {
    setup.state.rentalMutation.registerMutation(
      "relations.replaceDraftParties",
      {
        organizationId: testIds.organization,
        contractId: id,
        parties: [{ tenantId: relationIds.tenantId, isPrimaryPayer: true }],
      },
      {
        partyPeriods: {
          contractId: id,
          rows: [
            {
              tenantId: relationIds.tenantId,
              tenantType: "individual",
              tenantName: "测试租户",
              phone: "13800000001",
              email: "tenant@example.com",
              primaryContactName: null,
              documentCountryCode: "CN",
              documentType: "national_id",
              documentTypeOtherName: null,
              maskedDocumentNumber: null,
              validFrom: dates.startDate ?? null,
              validTo: dates.endDate ?? null,
              isPrimaryPayer: true,
              identitySnapshotCiphertext: null,
              identitySnapshotKeyVersion: null,
            },
          ],
        },
      },
    );
  }
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftDeposits",
    { organizationId: testIds.organization, contractId: id, deposits: [] },
    { deposits: { contractId: id, rows: [] } },
  );
}

function registerPropertyDetail(setup: TestAppHarness, id: string): void {
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, id],
    setup.state.rental.properties.get(id) ?? null,
  );
  setup.state.rentalQuery.registerRead("properties.detail", [testIds.organization, id], {
    id,
    ledgerId: "44444444-4444-4444-8444-444444444101",
    name: propertyPayload.name,
    type: propertyPayload.type,
    customTypeName: propertyPayload.customTypeName,
    countryCode: propertyPayload.countryCode,
    province: propertyPayload.province,
    city: propertyPayload.city,
    district: propertyPayload.district,
    addressLine: propertyPayload.addressLine,
    note: propertyPayload.note,
    isActive: true,
    spaceCount: 0,
    rentableSpaceCount: 0,
    activeContractCount: 0,
    upcomingContractCount: 0,
    expiringSoonContractCount: 0,
    updatedAt: new Date(FIXED_RENTAL_NOW),
    createdAt: new Date(FIXED_RENTAL_NOW),
  });
}

function registerSpaceAncestors(
  setup: TestAppHarness,
  spaceId: string,
  parentId?: string,
  propertyId: string = rentalTestIds.property,
): void {
  const space = setup.state.rental.spaces.get(spaceId) ?? null;
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, propertyId, spaceId],
    space,
  );
  const selfName = spaceId === rentalTestIds.childSpace ? "测试房间" : spaceId;
  setup.state.rentalQuery.registerRead(
    "spaces.ancestors",
    [testIds.organization, propertyId, spaceId],
    parentId
      ? [
          { id: parentId, name: parentId === rentalTestIds.parentSpace ? "测试楼栋" : "101" },
          { id: spaceId, name: selfName },
        ]
      : [{ id: spaceId, name: selfName }],
  );
}

function registerConfirmSnapshotsMutation(
  setup: TestAppHarness,
  contractId: string,
  spaceId: string,
  startDate: string,
  endDate: string,
  contractRow?: RentalContractRecord,
): void {
  const space = {
    spaceId,
    spaceName: "测试空间",
    spaceCode: null,
    spacePath: [{ id: spaceId, name: "测试空间" }],
    rentAllocationMinor: null,
  };
  const party = {
    tenantId: rentalTestIds.tenant,
    tenantType: "individual" as const,
    tenantName: "测试租户",
    phone: "13800000001",
    email: "tenant@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id" as const,
    documentTypeOtherName: null,
    maskedDocumentNumber: null,
    validFrom: startDate,
    validTo: endDate,
    isPrimaryPayer: true,
    identitySnapshotCiphertext: null,
    identitySnapshotKeyVersion: null,
  };
  const deposits: [] = [];
  setup.state.rentalMutation.registerMutation(
    "relations.confirmSnapshots",
    { organizationId: testIds.organization, contractId },
    {
      contractSpaces: { contractId, rows: [space] },
      partyPeriods: { contractId, rows: [party] },
      deposits: { contractId, rows: deposits },
      snapshots: { contractId, row: { contractId, spaces: [space], parties: [party], deposits } },
    },
  );
  const current = contractRow ?? setup.state.rental.contracts.get(contractId);
  if (!current) throw new Error("Expected draft contract fixture");
  const lifecycleInput = {
    organizationId: testIds.organization,
    id: contractId,
    status: "confirmed" as const,
    updatedByUserId: testIds.ownerUser,
  };
  setup.state.rentalMutation.registerMutation("contracts.setLifecycle", lifecycleInput, {
    contract: {
      id: contractId,
      row: { ...current, ...lifecycleInput, updatedAt: new Date(FIXED_RENTAL_NOW) },
    },
  });
}

function registerPreStartCorrectionFixture(
  setup: TestAppHarness,
  actorUserId: string = testIds.ownerUser,
): void {
  const beforeContract: RentalContractRecord = {
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: null,
    status: "confirmed",
    startDate: "2026-09-15",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    note: null,
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const afterContract: RentalContractRecord = {
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: null,
    status: "confirmed",
    startDate: "2026-09-15",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    note: "开始前修正",
    createdByUserId: testIds.ownerUser,
    updatedByUserId: actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
  const propertyFixture: RentalPropertyRecord = {
    id: rentalTestIds.property,
    organizationId: testIds.organization,
    ledgerId: "44444444-4444-4444-8444-444444444401",
    name: "测试房产",
    type: "apartment_building",
    customTypeName: null,
    countryCode: "CN",
    province: null,
    city: null,
    district: null,
    addressLine: "测试地址",
    note: null,
    isActive: true,
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const spaceFixture: RentalSpaceRecord = {
    id: rentalTestIds.childSpace,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    parentId: rentalTestIds.parentSpace,
    name: "测试房间",
    code: null,
    type: "room",
    customTypeName: null,
    isRentable: true,
    isActive: true,
    sortOrder: 0,
    note: null,
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const space = {
    spaceId: rentalTestIds.childSpace,
    spaceName: "测试空间",
    spaceCode: null,
    spacePath: [{ id: rentalTestIds.childSpace, name: "测试空间" }],
    rentAllocationMinor: null,
  };
  const party = {
    tenantId: rentalTestIds.tenant,
    tenantType: "individual" as const,
    tenantName: "测试租户",
    phone: "13800000001",
    email: "tenant@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id" as const,
    documentTypeOtherName: null,
    maskedDocumentNumber: null,
    validFrom: "2026-09-15",
    validTo: "2026-12-31",
    isPrimaryPayer: true,
    identitySnapshotCiphertext: null,
    identitySnapshotKeyVersion: null,
  };
  const detailFixture: RentalContractDetailRecord = {
    id: rentalTestIds.contract,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: null,
    startDate: "2026-09-15",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    updatedAt: new Date(FIXED_RENTAL_NOW),
    propertyName: "测试房产",
    lifecycleStatus: "confirmed",
    displayStatus: "upcoming",
    actualEndDate: "2026-12-31",
    tenantNames: ["测试租户"],
    spaceNames: ["测试空间"],
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    hasScheduledTermination: false,
    renewedFromContractId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationReason: null,
    note: "开始前修正",
    spaces: [space],
    parties: [party],
    depositTerms: [],
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  setup.state.rental.contracts.set(rentalTestIds.contract, beforeContract);
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, rentalTestIds.contract],
    beforeContract,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, rentalTestIds.contract],
    beforeContract,
  );
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, rentalTestIds.property],
    propertyFixture,
  );
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, rentalTestIds.property, rentalTestIds.childSpace],
    spaceFixture,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.detail",
    [testIds.organization, rentalTestIds.contract, "2026-08-31"],
    detailFixture,
  );
  setup.state.rentalQuery.registerSpaceConflict(
    {
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      spaceIds: [rentalTestIds.childSpace],
      startDate: "2026-09-15",
      endDate: "2026-12-31",
      excludeContractId: rentalTestIds.contract,
    },
    [],
  );
  registerConfirmSnapshotsMutation(
    setup,
    rentalTestIds.contract,
    rentalTestIds.childSpace,
    "2026-09-15",
    "2026-12-31",
    beforeContract,
  );
  const headerInput = {
    organizationId: testIds.organization,
    id: rentalTestIds.contract,
    propertyId: rentalTestIds.property,
    externalContractNumber: null,
    startDate: "2026-09-15",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "contract_start" as const,
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    note: "开始前修正",
    updatedByUserId: actorUserId,
  };
  setup.state.rentalMutation.registerMutation("contracts.updateHeader", headerInput, {
    contract: {
      id: rentalTestIds.contract,
      row: afterContract,
    },
  });
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftSpaces",
    {
      organizationId: testIds.organization,
      contractId: rentalTestIds.contract,
      propertyId: rentalTestIds.property,
      spaces: [{ spaceId: rentalTestIds.childSpace }],
    },
    {
      contractSpaces: {
        contractId: rentalTestIds.contract,
        rows: [
          {
            spaceId: rentalTestIds.childSpace,
            spaceName: "测试空间",
            spaceCode: null,
            spacePath: [{ id: rentalTestIds.childSpace, name: "测试空间" }],
            rentAllocationMinor: null,
          },
        ],
      },
    },
  );
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftParties",
    {
      organizationId: testIds.organization,
      contractId: rentalTestIds.contract,
      parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
    },
    {
      partyPeriods: {
        contractId: rentalTestIds.contract,
        rows: [
          {
            tenantId: rentalTestIds.tenant,
            tenantType: "individual",
            tenantName: "测试租户",
            phone: "13800000001",
            email: "tenant@example.com",
            primaryContactName: null,
            documentCountryCode: "CN",
            documentType: "national_id",
            documentTypeOtherName: null,
            maskedDocumentNumber: null,
            validFrom: "2026-09-15",
            validTo: "2026-12-31",
            isPrimaryPayer: true,
            identitySnapshotCiphertext: null,
            identitySnapshotKeyVersion: null,
          },
        ],
      },
    },
  );
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftDeposits",
    { organizationId: testIds.organization, contractId: rentalTestIds.contract, deposits: [] },
    { deposits: { contractId: rentalTestIds.contract, rows: [] } },
  );
}

function registerCorrectionConflictFixture(
  setup: TestAppHarness,
  status: "cancelled" | "confirmed",
  startDate: string,
): void {
  registerPreStartCorrectionFixture(setup);
  const contract: RentalContractRecord = {
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: null,
    status,
    startDate,
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancelledAt: status === "cancelled" ? new Date(FIXED_RENTAL_NOW) : null,
    cancelledByUserId: status === "cancelled" ? testIds.ownerUser : null,
    cancellationReason: status === "cancelled" ? "已取消" : null,
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    note: null,
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  setup.state.rental.contracts.set(rentalTestIds.contract, contract);
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, rentalTestIds.contract],
    contract,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, rentalTestIds.contract],
    contract,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.detail",
    [testIds.organization, rentalTestIds.contract, "2026-08-31"],
    {
      id: rentalTestIds.contract,
      propertyId: rentalTestIds.property,
      contractNumber: "RC-2026-000900",
      externalContractNumber: null,
      startDate,
      endDate: "2026-12-31",
      rentAmountMinor: 10000,
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      propertyName: "测试房产",
      lifecycleStatus: status,
      displayStatus: status === "cancelled" ? "cancelled" : "active",
      actualEndDate: "2026-12-31",
      tenantNames: ["测试租户"],
      spaceNames: ["测试空间"],
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      hasScheduledTermination: false,
      renewedFromContractId: null,
      cancellationReason: status === "cancelled" ? "已取消" : null,
      terminationDate: null,
      terminationReason: null,
      note: null,
      spaces: [],
      parties: [],
      depositTerms: [],
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    },
  );
}

function registerTenantDetail(setup: TestAppHarness, id: string, name: string): void {
  const row = {
    id,
    organizationId: testIds.organization,
    type: "individual",
    name,
    phone: "13800000001",
    email: "tenant@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id",
    documentTypeOtherName: null,
    maskedDocumentNumber: null,
    documentNumberLookupHash: `test-lookup-${id}`,
    sensitiveIdentityCiphertext: null,
    sensitiveIdentityKeyVersion: null,
    isActive: true,
    note: "测试备注",
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date(FIXED_RENTAL_NOW),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
  setup.state.rentalQuery.registerRead("tenants.detail", [testIds.organization, id], row);
  setup.state.rentalQuery.registerRead("tenants.findForUpdate", [testIds.organization, id], row);
}

const CORRECTION_RESPONSE: RentalContractDetail = {
  id: rentalTestIds.contract,
  propertyId: rentalTestIds.property,
  propertyName: "测试房产",
  contractNumber: "RC-2026-000900",
  externalContractNumber: null,
  lifecycleStatus: "confirmed",
  displayStatus: "upcoming",
  startDate: "2026-09-15",
  endDate: "2026-12-31",
  actualEndDate: "2026-12-31",
  rentAmountMinor: 10000,
  tenantNames: ["测试租户"],
  spaceNames: ["测试空间"],
  updatedAt: "2026-08-31T04:00:00.000Z",
  billingAnchor: "contract_start",
  paymentIntervalMonths: 1,
  dueDaysBefore: 0,
  hasScheduledTermination: false,
  renewedFromContractId: null,
  cancellationReason: null,
  terminationDate: null,
  terminationReason: null,
  note: "开始前修正",
  spaces: [
    {
      spaceId: rentalTestIds.childSpace,
      spaceName: "测试空间",
      spaceCode: null,
      spacePath: [{ id: rentalTestIds.childSpace, name: "测试空间" }],
      rentAllocationMinor: null,
    },
  ],
  parties: [
    {
      tenantId: rentalTestIds.tenant,
      type: "individual",
      name: "测试租户",
      phone: "13800000001",
      email: "tenant@example.com",
      primaryContactName: null,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      validFrom: "2026-09-15",
      validTo: "2026-12-31",
      isPrimaryPayer: true,
    },
  ],
  depositTerms: [],
  createdAt: "2026-08-01T00:00:00.000Z",
};

function registerTenantDocumentConflict(setup: TestAppHarness, documentNumber: string): void {
  const hash = setup.app.get(TenantIdentityCryptoService).lookupHash(testIds.organization, {
    countryCode: "CN",
    type: "national_id",
    documentNumber,
  });
  setup.state.rentalQuery.registerRead(
    "tenants.documentConflict",
    [testIds.organization, hash, undefined],
    null,
  );
}

function setupDeletedContractFixture(setup: TestAppHarness, id: string): void {
  setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], null);
  setup.state.rentalQuery.registerRead("contracts.findForUpdate", [testIds.organization, id], null);
  setup.state.rentalQuery.registerRead(
    "contracts.detail",
    [testIds.organization, id, "2026-08-31"],
    null,
  );
}

function registerExistingContractReads(setup: TestAppHarness, id: string): void {
  const contract = setup.state.rental.contracts.get(id);
  if (!contract) throw new Error("Expected created contract fixture");
  setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], {
    ...contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    status: "draft",
    deletedAt: null,
  });
  setup.state.rentalQuery.registerRead("contracts.findForUpdate", [testIds.organization, id], {
    ...contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    status: "draft",
    deletedAt: null,
  });
}

function registerCoreFixtures(setup: TestAppHarness): void {
  registerContractDetail(setup, generatedContractId);
  registerContractDetail(setup, rentalTestIds.contract, rentalTestIds.property, "RC-2026-000900", {
    startDate: "2026-08-01",
    endDate: "2026-12-31",
  });
  registerPropertyDetail(setup, generatedPropertyId);
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, rentalTestIds.property],
    setup.state.rental.properties.get(rentalTestIds.property) ?? null,
  );
  registerTenantDetail(setup, generatedTenantId, "替换租户");
  registerTenantDetail(setup, rentalTestIds.tenant, "测试租户");
  registerSpaceAncestors(setup, rentalTestIds.parentSpace);
  registerSpaceAncestors(setup, rentalTestIds.childSpace, rentalTestIds.parentSpace);
  registerSpaceAncestors(setup, generatedSpaceId);
  registerSpaceAncestors(setup, generatedSecondSpaceId);
  for (const id of [rentalTestIds.foreignContract, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99"]) {
    setup.state.rentalQuery.registerRead(
      "contracts.detail",
      [testIds.organization, id, "2026-08-31"],
      null,
    );
    setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], null);
    setup.state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, id],
      null,
    );
  }
}

/** 断言统一成功响应，并返回其中的业务数据。 */
function expectOk<T>(response: InjectResponse, statusCode = 200): T {
  expect(response.statusCode).toBe(statusCode);
  const body = parseJson<{ code: string; message: string; data: T }>(response);
  expect(body).toEqual({ code: "OK", message: "ok", data: expect.anything() });
  return body.data;
}

/** 断言统一失败响应，避免只校验 HTTP 状态而遗漏 API 契约。 */
function expectApiError(response: InjectResponse, statusCode: number, code: string): void {
  expect(response.statusCode).toBe(statusCode);
  expect(parseJson(response)).toEqual({ code, message: expect.any(String), data: null });
}

function expectSafeConflict(response: InjectResponse): void {
  expectApiError(response, 409, "CONFLICT");
  const serialized = JSON.stringify(parseJson(response));
  for (const key of [
    "tenantName",
    "documentNumber",
    "documentAddress",
    "birthDate",
    "gender",
    "ethnicity",
    "phone",
    "email",
    "note",
    "reason",
    "identitySnapshotCiphertext",
  ]) {
    expect(serialized).not.toContain(`"${key}"`);
  }
}

/** 断言没有业务数据的成功响应。 */
function expectEmptyOk(response: InjectResponse): void {
  expect(response.statusCode).toBe(200);
  expect(parseJson(response)).toEqual({ code: "OK", message: "ok", data: null });
}

function _expectOrdinaryResponseNotToContainSensitiveValues(
  response: InjectResponse,
  values: readonly string[],
): void {
  const serialized = JSON.stringify(parseJson(response));
  for (const value of values) expect(serialized).not.toContain(value);
  for (const key of [
    "sensitiveIdentityCiphertext",
    "sensitiveIdentityKeyVersion",
    "documentNumberLookupHash",
    "identitySnapshotCiphertext",
    "identitySnapshotKeyVersion",
    "documentAddress",
    "birthDate",
    "ethnicity",
  ]) {
    expect(serialized).not.toContain(`"${key}"`);
  }
}

function expectCorrectionRetryOracle(setup: TestAppHarness, auditLogsBefore: unknown[]): void {
  expect(setup.state.rental.contracts.get(rentalTestIds.contract)).toEqual({
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: null,
    status: "confirmed",
    startDate: "2026-09-15",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    note: "开始前修正",
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  });
  expect(setup.state.rental.contractSpaces.get(rentalTestIds.contract)).toEqual([
    CORRECTION_RESPONSE.spaces[0],
  ]);
  expect(setup.state.rental.partyPeriods.get(rentalTestIds.contract)).toEqual([
    {
      tenantId: rentalTestIds.tenant,
      tenantType: "individual",
      tenantName: "测试租户",
      phone: "13800000001",
      email: "tenant@example.com",
      primaryContactName: null,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      validFrom: "2026-09-15",
      validTo: "2026-12-31",
      isPrimaryPayer: true,
      identitySnapshotCiphertext: null,
      identitySnapshotKeyVersion: null,
    },
  ]);
  expect(setup.state.rental.deposits.get(rentalTestIds.contract)).toEqual([]);
  expect(setup.state.rental.snapshots.get(rentalTestIds.contract)).toEqual({
    contractId: rentalTestIds.contract,
    spaces: [CORRECTION_RESPONSE.spaces[0]],
    parties: [
      {
        tenantId: rentalTestIds.tenant,
        tenantType: "individual",
        tenantName: "测试租户",
        phone: "13800000001",
        email: "tenant@example.com",
        primaryContactName: null,
        documentCountryCode: "CN",
        documentType: "national_id",
        documentTypeOtherName: null,
        maskedDocumentNumber: null,
        validFrom: "2026-09-15",
        validTo: "2026-12-31",
        isPrimaryPayer: true,
        identitySnapshotCiphertext: null,
        identitySnapshotKeyVersion: null,
      },
    ],
    deposits: [],
  });
  expect(setup.state.rental.changes).toEqual(new Map());
  expect(setup.state.rental.actions).toEqual(new Map());
  expect(setup.state.rental.auditEntries).toEqual([
    {
      action: "rental_contract.corrected",
      targetId: rentalTestIds.contract,
      metadata: { changedFields: ["note"] },
    },
  ]);
  expect(setup.state.rental.contractCounters).toEqual(new Map());
  for (const counter of [
    "nextPropertyId",
    "nextSpaceId",
    "nextLedgerId",
    "nextTenantId",
    "nextContractId",
    "nextContractSpaceId",
    "nextPartyPeriodId",
    "nextChangeId",
    "nextDepositId",
    "nextSnapshotId",
    "nextActionId",
  ] as const) {
    expect(setup.state.rental[counter]).toBe(1);
  }
  expect(setup.state.auditLogs).toEqual([
    ...auditLogsBefore,
    expect.objectContaining({
      action: "rental_contract.corrected",
      targetId: rentalTestIds.contract,
      metadata: { changedFields: ["note"] },
    }),
  ]);
  expect([...setup.state.bookkeeping.ledgers.keys()]).toEqual([
    bookkeepingTestIds.ledger,
    bookkeepingTestIds.otherLedger,
  ]);
  expect([...setup.state.bookkeeping.accounts.keys()]).toEqual([
    bookkeepingTestIds.account,
    bookkeepingTestIds.otherAccount,
  ]);
  expect([...setup.state.bookkeeping.categories.keys()]).toEqual([
    bookkeepingTestIds.incomeCategory,
    bookkeepingTestIds.expenseCategory,
    bookkeepingTestIds.otherIncomeCategory,
  ]);
  expect([...setup.state.bookkeeping.transactions.keys()]).toEqual([
    bookkeepingTestIds.otherTransaction,
  ]);
  expect(setup.state.bookkeeping.movements).toEqual([
    {
      organizationId: testIds.otherOrganization,
      transactionId: bookkeepingTestIds.otherTransaction,
      accountId: bookkeepingTestIds.otherAccount,
      amountMinor: 100,
    },
  ]);
  expect(setup.state.bookkeeping.nextAccountId).toBe(1);
  expect(setup.state.bookkeeping.nextCategoryId).toBe(1);
  expect(setup.state.bookkeeping.nextTransactionId).toBe(1);
}

describe("Rental HTTP e2e", () => {
  let harness: TestAppHarness | null = null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await harness?.app.close();
    harness = null;
  });

  async function createHarness(): Promise<TestAppHarness> {
    harness = await createTestApp({ bookkeeping: true, rental: true });
    registerCoreFixtures(harness);
    return harness;
  }

  async function createProperty(headers: Record<string, string>): Promise<RentalPropertyDetail> {
    const { app } = harness ?? (await createHarness());
    const property = expectOk<RentalPropertyDetail>(
      await app.inject({
        method: "POST",
        url: "/api/rental-properties/create",
        headers,
        payload: propertyPayload,
      }),
    );
    registerPropertyDetail(harness as TestAppHarness, property.id);
    return property;
  }

  it("keeps contract reads available to member/viewer while only admin can write", async () => {
    const { app } = await createHarness();
    const adminHeaders = await authorization(app, "13800000007");
    const created = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers: adminHeaders,
        payload: { propertyId: rentalTestIds.property },
      }),
    );
    for (const phone of [TEST_PHONES.manager, TEST_PHONES.viewer]) {
      const headers = await authorization(app, phone);
      expectOk(
        await app.inject({
          method: "GET",
          url: `/api/rental-contracts/detail?id=${created.id}`,
          headers,
        }),
      );
      expectApiError(
        await app.inject({
          method: "POST",
          url: "/api/rental-contracts/update",
          headers,
          payload: { id: created.id, note: "不得写入" },
        }),
        403,
        "FORBIDDEN",
      );
    }
  });

  it("uses one not-found contract for foreign, missing, and deleted contract detail", async () => {
    const { app } = await createHarness();
    const headers = await authorization(app, "13800000007");
    const deleted = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload: { propertyId: rentalTestIds.property },
      }),
    );
    const createdContract =
      (harness as TestAppHarness).state.rental.contracts.get(deleted.id) ?? null;
    (harness as TestAppHarness).state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, deleted.id],
      createdContract,
    );
    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/delete",
        headers,
        payload: { id: deleted.id },
      }),
    );
    setupDeletedContractFixture(harness as TestAppHarness, deleted.id);
    const ownerHeaders = await authorization(app, TEST_PHONES.owner);
    for (const id of [
      rentalTestIds.foreignContract,
      deleted.id,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99",
    ]) {
      expectApiError(
        await app.inject({
          method: "GET",
          url: `/api/rental-contracts/detail?id=${id}`,
          headers: ownerHeaders,
        }),
        404,
        "NOT_FOUND",
      );
      expectApiError(
        await app.inject({
          method: "POST",
          url: "/api/rental-contracts/reveal-sensitive",
          headers: ownerHeaders,
          payload: {
            contractId: id,
            tenantId: rentalTestIds.tenant,
            validFrom: "2026-08-01",
          },
        }),
        404,
        "NOT_FOUND",
      );
      expectApiError(
        await app.inject({
          method: "POST",
          url: "/api/rental-contracts/renew",
          headers: ownerHeaders,
          payload: { id },
        }),
        404,
        "NOT_FOUND",
      );
    }
  });

  it("retries a draft contract after persisted audit failure without consuming ids or numbers", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    const payload = { propertyId: rentalTestIds.property };
    const before = cloneRentalTestState(state.rental);
    state.failNextRequiredAuditAppendAfterPersist = true;
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload,
      }),
      500,
      "INTERNAL_ERROR",
    );
    expect(cloneRentalTestState(state.rental)).toEqual(before);
    const retry = expectOk<{ id: string; contractNumber: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload,
      }),
    );
    expect(retry.contractNumber).toBe("RC-2026-000001");
    expect(retry.id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-000000000001");
    expect(state.rental.nextContractId).toBe(before.nextContractId + 1);
    expect(state.rental.contractCounters.get(`${testIds.organization}/2026`)).toBe(1);
  });

  it("retries a draft contract after repository failure without bookkeeping residue", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    const before = cloneRentalTestState(state.rental);
    state.rental.failNextRepositoryOperation = "contracts.createDraft";
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload: { propertyId: rentalTestIds.property },
      }),
      500,
      "INTERNAL_ERROR",
    );
    expect(cloneRentalTestState(state.rental)).toEqual(before);
    const retry = expectOk<{ id: string; contractNumber: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload: { propertyId: rentalTestIds.property },
      }),
    );
    expect(retry.id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-000000000001");
    expect(retry.contractNumber).toBe("RC-2026-000001");
    expect(state.auditLogs.filter((entry) => entry.targetId === retry.id)).toHaveLength(1);
  });

  it("creates and updates a draft contract with replace semantics across relation seams", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    const property = await createProperty(headers);
    registerContractDetail(
      harness as TestAppHarness,
      generatedContractId,
      property.id,
      "RC-2026-000001",
      {},
      {
        tenantId: rentalTestIds.tenant,
        spaceId: generatedSpaceId,
      },
    );
    registerSpaceAncestors(harness as TestAppHarness, generatedSpaceId, undefined, property.id);
    registerSpaceAncestors(
      harness as TestAppHarness,
      generatedSecondSpaceId,
      undefined,
      property.id,
    );
    const room = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: { propertyId: property.id, name: "101", type: "room", isRentable: true },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, room.id, undefined, property.id);
    const draft = expectOk<{ id: string; contractNumber: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload: { propertyId: property.id },
      }),
    );
    const draftRow = state.rental.contracts.get(draft.id);
    if (!draftRow) throw new Error("Expected created draft fixture");
    const firstUpdateInput = {
      organizationId: testIds.organization,
      id: draft.id,
      propertyId: property.id,
      externalContractNumber: null,
      startDate: "2026-09-01",
      endDate: "2026-12-31",
      rentAmountMinor: 10000,
      billingAnchor: "contract_start" as const,
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      note: null,
      updatedByUserId: testIds.ownerUser,
    };
    state.rentalMutation.registerMutation("contracts.updateHeader", firstUpdateInput, {
      contract: {
        id: draft.id,
        row: { ...draftRow, ...firstUpdateInput, updatedAt: new Date(FIXED_RENTAL_NOW) },
      },
    });
    registerContractDetail(
      harness as TestAppHarness,
      draft.id,
      property.id,
      "RC-2026-000001",
      {
        startDate: "2026-09-01",
        endDate: "2026-12-31",
      },
      { tenantId: rentalTestIds.tenant, spaceId: room.id },
    );
    expect(draft.contractNumber).toBe("RC-2026-000001");
    const updated = expectOk<{
      id: string;
      parties: Array<{ tenantId: string }>;
      spaces: Array<{ spaceId: string }>;
    }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/update",
        headers,
        payload: {
          id: draft.id,
          startDate: "2026-09-01",
          endDate: "2026-12-31",
          rentAmountMinor: 10000,
          billingAnchor: "contract_start",
          paymentIntervalMonths: 1,
          dueDaysBefore: 0,
          parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
          spaces: [{ spaceId: room.id }],
          depositTerms: [],
        },
      }),
    );
    expect(updated).toMatchObject({
      id: draft.id,
      parties: [{ tenantId: rentalTestIds.tenant }],
      spaces: [{ spaceId: room.id }],
    });
    expect(state.rental.partyPeriods.get(draft.id)).toHaveLength(1);
    expect(state.rental.contractSpaces.get(draft.id)).toHaveLength(1);

    registerTenantDocumentConflict(harness as TestAppHarness, "110101199001011236");
    const replacementTenant = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers,
        payload: {
          type: "individual",
          name: "替换租户",
          phone: "13900000002",
          documentCountryCode: "CN",
          documentType: "national_id",
          documentNumber: "110101199001011236",
        },
      }),
    );
    registerTenantDetail(harness as TestAppHarness, replacementTenant.id, "替换租户");
    const replacementRoom = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: { propertyId: property.id, name: "102", type: "room", isRentable: true },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, replacementRoom.id, undefined, property.id);
    const secondRow = state.rental.contracts.get(draft.id);
    if (!secondRow) throw new Error("Expected updated draft fixture");
    const secondHeaderInput = {
      organizationId: testIds.organization,
      id: draft.id,
      propertyId: property.id,
      externalContractNumber: null,
      startDate: "2026-09-01",
      endDate: "2026-12-31",
      rentAmountMinor: 10000,
      billingAnchor: "contract_start" as const,
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      note: null,
      updatedByUserId: testIds.ownerUser,
    };
    state.rentalMutation.registerMutation("contracts.updateHeader", secondHeaderInput, {
      contract: {
        id: draft.id,
        row: { ...secondRow, ...secondHeaderInput, updatedAt: new Date(FIXED_RENTAL_NOW) },
      },
    });
    state.rentalMutation.registerMutation(
      "relations.replaceDraftSpaces",
      {
        organizationId: testIds.organization,
        contractId: draft.id,
        propertyId: property.id,
        spaces: [{ spaceId: replacementRoom.id }],
      },
      {
        contractSpaces: {
          contractId: draft.id,
          rows: [
            {
              spaceId: replacementRoom.id,
              spaceName: "测试空间",
              spaceCode: null,
              spacePath: [{ id: replacementRoom.id, name: "测试空间" }],
              rentAllocationMinor: null,
            },
          ],
        },
      },
    );
    state.rentalMutation.registerMutation(
      "relations.replaceDraftParties",
      {
        organizationId: testIds.organization,
        contractId: draft.id,
        parties: [{ tenantId: replacementTenant.id, isPrimaryPayer: true }],
      },
      {
        partyPeriods: {
          contractId: draft.id,
          rows: [
            {
              tenantId: replacementTenant.id,
              tenantType: "individual",
              tenantName: "替换租户",
              phone: "13900000002",
              email: null,
              primaryContactName: null,
              documentCountryCode: "CN",
              documentType: "national_id",
              documentTypeOtherName: null,
              maskedDocumentNumber: null,
              validFrom: "2026-09-01",
              validTo: "2026-12-31",
              isPrimaryPayer: true,
              identitySnapshotCiphertext: null,
              identitySnapshotKeyVersion: null,
            },
          ],
        },
      },
    );
    state.rentalMutation.registerMutation(
      "relations.replaceDraftDeposits",
      {
        organizationId: testIds.organization,
        contractId: draft.id,
        deposits: [
          {
            type: "rental",
            customName: null,
            calculationMode: "fixed_amount",
            fixedAmountMinor: 20000,
            rentMultiple: null,
            sortOrder: 0,
          },
        ],
      },
      {
        deposits: {
          contractId: draft.id,
          rows: [
            {
              id: "dddddddd-dddd-4ddd-8ddd-000000000001",
              type: "rental",
              customName: null,
              calculationMode: "fixed_amount",
              fixedAmountMinor: 20000,
              rentMultiple: null,
              finalAmountMinor: null,
              sortOrder: 0,
            },
          ],
        },
      },
    );
    expectOk(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/update",
        headers,
        payload: {
          id: draft.id,
          parties: [{ tenantId: replacementTenant.id, isPrimaryPayer: true }],
          spaces: [{ spaceId: replacementRoom.id }],
          depositTerms: [
            { type: "rental", calculationMode: "fixed_amount", fixedAmountMinor: 20000 },
          ],
        },
      }),
    );
    expect(state.rental.partyPeriods.get(draft.id)).toEqual([
      expect.objectContaining({ tenantId: replacementTenant.id }),
    ]);
    expect(state.rental.deposits.get(draft.id)).toEqual([
      expect.objectContaining({ fixedAmountMinor: 20000, finalAmountMinor: null }),
    ]);
    expect(state.rental.partyPeriods.get(draft.id)).not.toEqual([
      expect.objectContaining({ tenantId: rentalTestIds.tenant }),
    ]);
    expect(state.rental.contractSpaces.get(draft.id)).toEqual([
      expect.objectContaining({ spaceId: replacementRoom.id }),
    ]);
    expect(state.rental.contractSpaces.get(draft.id)).not.toEqual([
      expect.objectContaining({ spaceId: room.id }),
    ]);
  });

  it("corrects a confirmed pre-start contract through the real HTTP transaction", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    registerPreStartCorrectionFixture(harness as TestAppHarness);
    const auditLogsBeforeRequest = structuredClone(state.auditLogs);

    const corrected = expectOk<RentalContractDetail>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/update",
        headers,
        payload: { id: rentalTestIds.contract, note: "开始前修正" },
      }),
    );
    expect(corrected).toEqual(CORRECTION_RESPONSE);
    expect(state.rental.contracts.get(rentalTestIds.contract)).toEqual({
      id: rentalTestIds.contract,
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      contractNumber: "RC-2026-000900",
      externalContractNumber: null,
      status: "confirmed",
      startDate: "2026-09-15",
      endDate: "2026-12-31",
      rentAmountMinor: 10000,
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      renewedFromContractId: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      terminationDate: null,
      terminationRecordedAt: null,
      terminatedByUserId: null,
      terminationReason: null,
      note: "开始前修正",
      createdByUserId: testIds.ownerUser,
      updatedByUserId: testIds.ownerUser,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date(FIXED_RENTAL_NOW),
    });
    expect(state.rental.contractSpaces.get(rentalTestIds.contract)).toEqual([
      CORRECTION_RESPONSE.spaces[0],
    ]);
    expect(state.rental.partyPeriods.get(rentalTestIds.contract)).toEqual([
      {
        tenantId: rentalTestIds.tenant,
        tenantType: "individual",
        tenantName: "测试租户",
        phone: "13800000001",
        email: "tenant@example.com",
        primaryContactName: null,
        documentCountryCode: "CN",
        documentType: "national_id",
        documentTypeOtherName: null,
        maskedDocumentNumber: null,
        validFrom: "2026-09-15",
        validTo: "2026-12-31",
        isPrimaryPayer: true,
        identitySnapshotCiphertext: null,
        identitySnapshotKeyVersion: null,
      },
    ]);
    expect(state.rental.deposits.get(rentalTestIds.contract)).toEqual([]);
    expect(state.rental.snapshots.get(rentalTestIds.contract)).toEqual({
      contractId: rentalTestIds.contract,
      spaces: CORRECTION_RESPONSE.spaces,
      parties: [
        {
          tenantId: rentalTestIds.tenant,
          tenantType: "individual",
          tenantName: "测试租户",
          phone: "13800000001",
          email: "tenant@example.com",
          primaryContactName: null,
          documentCountryCode: "CN",
          documentType: "national_id",
          documentTypeOtherName: null,
          maskedDocumentNumber: null,
          validFrom: "2026-09-15",
          validTo: "2026-12-31",
          isPrimaryPayer: true,
          identitySnapshotCiphertext: null,
          identitySnapshotKeyVersion: null,
        },
      ],
      deposits: [],
    });
    expect(state.rental.changes).toEqual(new Map());
    expect(state.rental.actions).toEqual(new Map());
    expect(state.rental.auditEntries).toEqual([
      {
        action: "rental_contract.corrected",
        targetId: rentalTestIds.contract,
        metadata: { changedFields: ["note"] },
      },
    ]);
    expect(state.auditLogs).toEqual([
      ...auditLogsBeforeRequest,
      expect.objectContaining({
        organizationId: testIds.organization,
        actorUserId: testIds.ownerUser,
        action: "rental_contract.corrected",
        targetType: "rental_contract",
        targetId: rentalTestIds.contract,
        result: "succeeded",
        metadata: { changedFields: ["note"] },
      }),
    ]);
    expect(state.rental.nextContractSpaceId).toBe(1);
    expect(state.rental.nextPartyPeriodId).toBe(1);
    expect(state.rental.nextDepositId).toBe(1);
    expect(state.rental.nextSnapshotId).toBe(1);
    expect(state.rental.nextChangeId).toBe(1);
    expect(state.rental.nextActionId).toBe(1);
  });

  it("rolls back correction repository and audit faults before retrying the same fixture", async () => {
    for (const fault of ["repository", "relation", "snapshot", "audit"] as const) {
      const { app, state } = await createHarness();
      registerPreStartCorrectionFixture(harness as TestAppHarness);
      const headers = await authorization(app, TEST_PHONES.owner);
      const before = cloneRentalTestState(state.rental);
      const bookkeepingBefore = cloneBookkeepingTestState(state.bookkeeping);
      const auditLogsBefore = structuredClone(state.auditLogs);
      if (fault === "repository") {
        state.rental.failNextRepositoryOperation = "contracts.updateHeader";
        state.rental.failNextRepositoryOperationPhase = "after";
      } else if (fault === "relation") {
        state.rental.failNextRepositoryOperation = "relations.replaceDraftSpaces";
        state.rental.failNextRepositoryOperationPhase = "after";
      } else if (fault === "snapshot") {
        state.rental.failNextRepositoryOperation = "relations.confirmSnapshots";
        state.rental.failNextRepositoryOperationPhase = "after";
      } else {
        state.failNextRequiredAuditAppendAfterPersist = true;
      }
      expectApiError(
        await app.inject({
          method: "POST",
          url: "/api/rental-contracts/update",
          headers,
          payload: { id: rentalTestIds.contract, note: "开始前修正" },
        }),
        500,
        "INTERNAL_ERROR",
      );
      expect(cloneRentalTestState(state.rental)).toEqual(before);
      expect(cloneBookkeepingTestState(state.bookkeeping)).toEqual(bookkeepingBefore);
      expect(state.rental.auditEntries).toEqual([]);
      expect(state.auditLogs).toEqual(auditLogsBefore);
      const retried = expectOk<RentalContractDetail>(
        await app.inject({
          method: "POST",
          url: "/api/rental-contracts/update",
          headers,
          payload: { id: rentalTestIds.contract, note: "开始前修正" },
        }),
      );
      expect(retried).toEqual(CORRECTION_RESPONSE);
      expect(state.rental.contracts.get(rentalTestIds.contract)?.note).toBe("开始前修正");
      expect(state.rental.contractSpaces.get(rentalTestIds.contract)).toEqual([
        CORRECTION_RESPONSE.spaces[0],
      ]);
      expect(state.rental.partyPeriods.get(rentalTestIds.contract)).toEqual([
        expect.objectContaining({
          tenantId: rentalTestIds.tenant,
          validFrom: "2026-09-15",
          validTo: "2026-12-31",
        }),
      ]);
      expect(state.rental.deposits.get(rentalTestIds.contract)).toEqual([]);
      expect(state.rental.snapshots.get(rentalTestIds.contract)).toEqual(
        expect.objectContaining({ contractId: rentalTestIds.contract }),
      );
      expect(state.rental.changes).toEqual(new Map());
      expect(state.rental.actions).toEqual(new Map());
      expect(state.auditLogs).toEqual([
        ...auditLogsBefore,
        expect.objectContaining({
          action: "rental_contract.corrected",
          targetId: rentalTestIds.contract,
          metadata: { changedFields: ["note"] },
        }),
      ]);
      expect(state.rental.auditEntries).toEqual([
        {
          action: "rental_contract.corrected",
          targetId: rentalTestIds.contract,
          metadata: { changedFields: ["note"] },
        },
      ]);
      expectCorrectionRetryOracle(harness as TestAppHarness, auditLogsBefore);
      await app.close();
      harness = null;
    }
  });

  it("allows admin correction and rejects correction outside the scoped pre-start contract", async () => {
    const adminSetup = await createHarness();
    registerPreStartCorrectionFixture(adminSetup, adminUserId);
    const adminResponse = expectOk<RentalContractDetail>(
      await adminSetup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/update",
        headers: await authorization(adminSetup.app, "13800000007"),
        payload: { id: rentalTestIds.contract, note: "开始前修正" },
      }),
    );
    expect(adminResponse).toEqual(CORRECTION_RESPONSE);
    expect(adminSetup.state.rental.contracts.get(rentalTestIds.contract)).toEqual({
      id: rentalTestIds.contract,
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      contractNumber: "RC-2026-000900",
      externalContractNumber: null,
      status: "confirmed",
      startDate: "2026-09-15",
      endDate: "2026-12-31",
      rentAmountMinor: 10000,
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      renewedFromContractId: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      terminationDate: null,
      terminationRecordedAt: null,
      terminatedByUserId: null,
      terminationReason: null,
      note: "开始前修正",
      createdByUserId: testIds.ownerUser,
      updatedByUserId: adminUserId,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date(FIXED_RENTAL_NOW),
    });
    await adminSetup.app.close();
    harness = null;

    for (const phone of [TEST_PHONES.manager, TEST_PHONES.viewer]) {
      const setup = await createHarness();
      const headers = await authorization(setup.app, phone);
      const before = cloneRentalTestState(setup.state.rental);
      expectApiError(
        await setup.app.inject({
          method: "POST",
          url: "/api/rental-contracts/update",
          headers,
          payload: { id: rentalTestIds.contract, note: "不得修正" },
        }),
        403,
        "FORBIDDEN",
      );
      expect(cloneRentalTestState(setup.state.rental)).toEqual(before);
      await setup.app.close();
      harness = null;
    }

    for (const id of [rentalTestIds.foreignContract, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb98"]) {
      const setup = await createHarness();
      if (id.endsWith("98")) {
        const current = setup.state.rental.contracts.get(rentalTestIds.contract);
        if (!current) throw new Error("Expected confirmed contract fixture");
        setup.state.rental.contracts.set(id, {
          ...current,
          id,
          deletedAt: new Date(FIXED_RENTAL_NOW),
        });
      }
      setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], null);
      setup.state.rentalQuery.registerRead(
        "contracts.findForUpdate",
        [testIds.organization, id],
        null,
      );
      const headers = await authorization(setup.app, TEST_PHONES.owner);
      const before = cloneRentalTestState(setup.state.rental);
      expectApiError(
        await setup.app.inject({
          method: "POST",
          url: "/api/rental-contracts/update",
          headers,
          payload: { id, note: "不存在" },
        }),
        404,
        "NOT_FOUND",
      );
      expect(cloneRentalTestState(setup.state.rental)).toEqual(before);
      await setup.app.close();
      harness = null;
    }

    const setup = await createHarness();
    const current = setup.state.rental.contracts.get(rentalTestIds.contract);
    if (!current) throw new Error("Expected confirmed contract fixture");
    setup.state.rental.contracts.set(rentalTestIds.contract, {
      ...current,
      status: "confirmed",
      startDate: "2026-08-01",
      endDate: "2026-12-31",
    });
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = cloneRentalTestState(setup.state.rental);
    expectSafeConflict(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/update",
        headers,
        payload: { id: rentalTestIds.contract, startDate: "2026-09-15" },
      }),
    );
    expect(cloneRentalTestState(setup.state.rental)).toEqual(before);
    await setup.app.close();
    harness = null;
  });

  it("rejects correction for an illegal lifecycle and on the start-day boundary without writes", async () => {
    for (const scenario of [
      { status: "cancelled" as const, startDate: "2026-09-15", note: "已取消合同" },
      { status: "confirmed" as const, startDate: "2026-08-31", note: "开始日核心修正" },
    ]) {
      const setup = await createHarness();
      registerCorrectionConflictFixture(setup, scenario.status, scenario.startDate);
      const headers = await authorization(setup.app, TEST_PHONES.owner);
      const before = cloneRentalTestState(setup.state.rental);
      const bookkeepingBefore = cloneBookkeepingTestState(setup.state.bookkeeping);
      const auditLogsBefore = structuredClone(setup.state.auditLogs);
      expectApiError(
        await setup.app.inject({
          method: "POST",
          url: "/api/rental-contracts/update",
          headers,
          payload:
            scenario.status === "confirmed"
              ? { id: rentalTestIds.contract, startDate: "2026-09-01" }
              : { id: rentalTestIds.contract, note: scenario.note },
        }),
        409,
        "CONFLICT",
      );
      expect(cloneRentalTestState(setup.state.rental)).toEqual(before);
      expect(cloneBookkeepingTestState(setup.state.bookkeeping)).toEqual(bookkeepingBefore);
      expect(setup.state.auditLogs).toEqual(auditLogsBefore);
      expect(setup.state.rental.auditEntries).toEqual([]);
      await setup.app.close();
      harness = null;
    }
  });

  it("returns one safe 404 for an actually missing correction contract", async () => {
    const setup = await createHarness();
    const missingId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000404";
    setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, missingId], null);
    setup.state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, missingId],
      null,
    );
    setup.state.rentalQuery.registerRead(
      "contracts.detail",
      [testIds.organization, missingId, "2026-08-31"],
      null,
    );
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const rentalBefore = cloneRentalTestState(setup.state.rental);
    const bookkeepingBefore = cloneBookkeepingTestState(setup.state.bookkeeping);
    const auditLogsBefore = structuredClone(setup.state.auditLogs);
    expectApiError(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/update",
        headers,
        payload: { id: missingId, note: "不存在" },
      }),
      404,
      "NOT_FOUND",
    );
    expect(cloneRentalTestState(setup.state.rental)).toEqual(rentalBefore);
    expect(cloneBookkeepingTestState(setup.state.bookkeeping)).toEqual(bookkeepingBefore);
    expect(setup.state.auditLogs).toEqual(auditLogsBefore);
    expect(setup.state.rental.auditEntries).toEqual([]);
    await setup.app.close();
    harness = null;
  });

  it("returns a safe conflict when a confirmation overlaps an existing contract space", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    registerContractDetail(
      harness as TestAppHarness,
      generatedContractId,
      rentalTestIds.property,
      "RC-2026-000001",
      {
        startDate: "2026-10-01",
        endDate: "2026-11-01",
      },
      { tenantId: rentalTestIds.tenant, spaceId: rentalTestIds.childSpace },
    );
    const draft = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload: {
          propertyId: rentalTestIds.property,
          startDate: "2026-10-01",
          endDate: "2026-11-01",
          rentAmountMinor: 10000,
          billingAnchor: "contract_start",
          paymentIntervalMonths: 1,
          dueDaysBefore: 0,
          parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
          spaces: [{ spaceId: rentalTestIds.childSpace }],
          depositTerms: [],
        },
      }),
    );
    registerExistingContractReads(harness as TestAppHarness, draft.id);
    state.rentalQuery.registerSpaceConflict(
      {
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        spaceIds: [rentalTestIds.childSpace],
        startDate: "2026-10-01",
        endDate: "2026-11-01",
        excludeContractId: draft.id,
      },
      [
        {
          contractId: rentalTestIds.contract,
          contractNumber: "RC-2026-000900",
          spaceId: rentalTestIds.childSpace,
        },
      ],
    );
    const before = cloneRentalTestState(state.rental);
    const conflict = await app.inject({
      method: "POST",
      url: "/api/rental-contracts/confirm",
      headers,
      payload: { id: draft.id },
    });
    expectSafeConflict(conflict);
    expect(state.rentalQuery.spaceConflictCalls).toEqual([
      {
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        spaceIds: [rentalTestIds.childSpace],
        startDate: "2026-10-01",
        endDate: "2026-11-01",
        excludeContractId: draft.id,
      },
    ]);
    expect(cloneRentalTestState(state.rental)).toEqual(before);
  });

  it("checks own, ancestor, descendant, boundary, and historical space conflicts through HTTP", async () => {
    const cases: Array<{
      title: string;
      spaceId: string;
      start: string;
      end: string;
      status: 200 | 409;
      existingParent?: boolean;
      createGrandchild?: boolean;
    }> = [
      {
        title: "own space",
        spaceId: rentalTestIds.childSpace,
        start: "2026-10-01",
        end: "2026-11-01",
        status: 409,
      },
      {
        title: "ancestor space",
        spaceId: rentalTestIds.parentSpace,
        start: "2026-10-01",
        end: "2026-11-01",
        status: 409,
      },
      {
        title: "existing parent requested child",
        spaceId: rentalTestIds.childSpace,
        start: "2026-10-01",
        end: "2026-11-01",
        status: 409,
        existingParent: true,
      },
      {
        title: "existing parent requested grandchild",
        spaceId: rentalTestIds.childSpace,
        start: "2026-10-01",
        end: "2026-11-01",
        status: 409,
        existingParent: true,
        createGrandchild: true,
      },
      {
        title: "adjacent after end",
        spaceId: rentalTestIds.childSpace,
        start: "2027-01-01",
        end: "2027-02-01",
        status: 200,
      },
      {
        title: "historical before start",
        spaceId: rentalTestIds.childSpace,
        start: "2026-01-01",
        end: "2026-07-31",
        status: 200,
      },
      {
        title: "shared boundary",
        spaceId: rentalTestIds.childSpace,
        start: "2026-12-31",
        end: "2027-01-31",
        status: 409,
      },
    ];
    for (const testCase of cases) {
      const setup = await createTestApp({ bookkeeping: true, rental: true });
      harness = setup;
      registerCoreFixtures(setup);
      const headers = await authorization(setup.app, TEST_PHONES.owner);
      if (testCase.existingParent) {
        const currentSpace = setup.state.rental.contractSpaces.get(rentalTestIds.contract)?.[0];
        if (!currentSpace) throw new Error("Expected seeded contract space");
        setup.state.rental.contractSpaces.set(rentalTestIds.contract, [
          {
            ...currentSpace,
            spaceId: rentalTestIds.parentSpace,
            spaceName: "测试楼栋",
            spaceCode: null,
            spacePath: [{ id: rentalTestIds.parentSpace, name: "测试楼栋" }],
          },
        ]);
      }
      let spaceId = testCase.spaceId;
      if (testCase.createGrandchild) {
        const grandchild = expectOk<{ id: string }>(
          await setup.app.inject({
            method: "POST",
            url: "/api/rental-spaces/create",
            headers,
            payload: {
              propertyId: rentalTestIds.property,
              parentId: rentalTestIds.childSpace,
              name: "测试床位",
              type: "room",
              isRentable: true,
            },
          }),
        );
        spaceId = grandchild.id;
        registerSpaceAncestors(setup, spaceId, rentalTestIds.childSpace);
      }
      registerContractDetail(
        setup,
        generatedContractId,
        rentalTestIds.property,
        "RC-2026-000001",
        {
          startDate: testCase.start,
          endDate: testCase.end,
        },
        { tenantId: rentalTestIds.tenant, spaceId },
      );
      const draft = expectOk<{ id: string }>(
        await setup.app.inject({
          method: "POST",
          url: "/api/rental-contracts/create",
          headers,
          payload: {
            propertyId: rentalTestIds.property,
            startDate: testCase.start,
            endDate: testCase.end,
            rentAmountMinor: 10000,
            billingAnchor: "contract_start",
            paymentIntervalMonths: 1,
            dueDaysBefore: 0,
            parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
            spaces: [{ spaceId }],
            depositTerms: [],
          },
        }),
      );
      registerExistingContractReads(setup, draft.id);
      if (testCase.status === 200) {
        registerConfirmSnapshotsMutation(setup, draft.id, spaceId, testCase.start, testCase.end);
      }
      setup.state.rentalQuery.registerSpaceConflict(
        {
          organizationId: testIds.organization,
          propertyId: rentalTestIds.property,
          spaceIds: [spaceId],
          startDate: testCase.start,
          endDate: testCase.end,
          excludeContractId: draft.id,
        },
        testCase.status === 409
          ? [
              {
                contractId: rentalTestIds.contract,
                contractNumber: "RC-2026-000900",
                spaceId: testCase.existingParent
                  ? rentalTestIds.parentSpace
                  : rentalTestIds.childSpace,
              },
            ]
          : [],
      );
      const response = await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/confirm",
        headers,
        payload: { id: draft.id },
      });
      if (testCase.status === 200) expectOk(response);
      else {
        expectSafeConflict(response);
        expect(response.payload).not.toContain("测试租户");
        expect(response.payload).not.toContain("13800000001");
      }
      await setup.app.close();
      harness = null;
    }
  });

  async function authorization(app: TestAppHarness["app"], phone: string) {
    const { accessToken } = await login(app, phone);
    return { authorization: `Bearer ${accessToken}` };
  }
});
