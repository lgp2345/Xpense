import type { RentalContractDetail } from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, parseJson, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { cloneBookkeepingTestState } from "../../test/bookkeeping-test-state.js";
import {
  createTestApp,
  type TestAppHarness,
  type TestAppOptions,
} from "../../test/create-test-app.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-harness.js";
import { FIXED_RENTAL_NOW } from "../../test/rental-test-state.js";
import type {
  RentalContractDetailRecord,
  RentalContractRecord,
} from "./contracts.repository.types.js";
import type { RentalTenantRecord } from "./tenants.repository.types.js";

type InjectResponse = { payload: string; statusCode: number };

const generatedContractId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const adminUserId = "11111111-1111-4111-8111-111111111106";

function registerContractDetail(
  setup: TestAppHarness,
  id: string,
  spaceId: string,
  startDate: string,
  endDate: string,
  options: {
    lifecycleStatus?: string;
    displayStatus?: string;
    cancellationReason?: string | null;
    spaceName?: string;
    spacePath?: Array<{ id: string; name: string }>;
  } = {},
  contractFixture?: RentalContractRecord,
): void {
  setup.state.rentalQuery.registerRead(
    "contracts.detail",
    [testIds.organization, id, "2026-08-31"],
    {
      id,
      propertyId: rentalTestIds.property,
      contractNumber: "RC-2026-000001",
      externalContractNumber: null,
      startDate,
      endDate,
      rentAmountMinor: 10000,
      updatedAt: new Date(FIXED_RENTAL_NOW),
      propertyName: "测试房产",
      lifecycleStatus: options.lifecycleStatus ?? "draft",
      displayStatus: options.displayStatus ?? "upcoming",
      actualEndDate: endDate,
      tenantNames: ["测试租户"],
      spaceNames: [options.spaceName ?? "测试空间"],
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      hasScheduledTermination: false,
      renewedFromContractId: null,
      cancellationReason: options.cancellationReason ?? null,
      terminationDate: null,
      terminationReason: null,
      note: null,
      spaces: [
        {
          spaceId,
          spaceName: options.spaceName ?? "测试空间",
          spaceCode: null,
          spacePath: options.spacePath ?? [{ id: spaceId, name: "测试空间" }],
          rentAllocationMinor: null,
        },
      ],
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
          validFrom: startDate,
          validTo: endDate,
          isPrimaryPayer: true,
        },
      ],
      depositTerms: [],
      createdAt: new Date(FIXED_RENTAL_NOW),
    },
  );
  const header = contractFixture ?? setup.state.rental.contracts.get(id) ?? null;
  setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], header);
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, id],
    header,
  );
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftSpaces",
    {
      organizationId: testIds.organization,
      contractId: id,
      propertyId: rentalTestIds.property,
      spaces: [{ spaceId }],
    },
    {
      contractSpaces: {
        contractId: id,
        rows: [
          {
            spaceId,
            spaceName: "测试空间",
            spaceCode: null,
            spacePath: [{ id: spaceId, name: "测试空间" }],
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
      contractId: id,
      parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
    },
    {
      partyPeriods: {
        contractId: id,
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
            validFrom: startDate,
            validTo: endDate,
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
    { organizationId: testIds.organization, contractId: id, deposits: [] },
    { deposits: { contractId: id, rows: [] } },
  );
}

function registerCancelMutation(setup: TestAppHarness, actorUserId: string): void {
  const input = {
    organizationId: testIds.organization,
    id: rentalTestIds.contract,
    status: "cancelled" as const,
    updatedByUserId: actorUserId,
    cancelledAt: new Date(FIXED_RENTAL_NOW),
    cancelledByUserId: actorUserId,
    cancellationReason: "提前取消",
  };
  setup.state.rentalMutation.registerMutation("contracts.setLifecycle", input, {
    contract: {
      id: rentalTestIds.contract,
      row: {
        id: rentalTestIds.contract,
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        contractNumber: "RC-2026-000001",
        externalContractNumber: null,
        status: "cancelled",
        startDate: "2026-09-15",
        endDate: "2026-12-31",
        rentAmountMinor: 10000,
        billingAnchor: "contract_start",
        paymentIntervalMonths: 1,
        dueDaysBefore: 0,
        renewedFromContractId: null,
        cancelledAt: new Date(FIXED_RENTAL_NOW),
        cancelledByUserId: actorUserId,
        cancellationReason: "提前取消",
        terminationDate: null,
        terminationRecordedAt: null,
        terminatedByUserId: null,
        terminationReason: null,
        note: null,
        createdByUserId: testIds.ownerUser,
        updatedByUserId: actorUserId,
        deletedAt: null,
        deletedByUserId: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date(FIXED_RENTAL_NOW),
      } satisfies RentalContractRecord,
    },
  });
}

function confirmedPreStartContract(): RentalContractRecord {
  return {
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000001",
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
}

function cancelledPreStartContract(actorUserId: string): RentalContractRecord {
  return {
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000001",
    externalContractNumber: null,
    status: "cancelled",
    startDate: "2026-09-15",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancelledAt: new Date(FIXED_RENTAL_NOW),
    cancelledByUserId: actorUserId,
    cancellationReason: "提前取消",
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    note: null,
    createdByUserId: testIds.ownerUser,
    updatedByUserId: actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
}

const CANCEL_RESPONSE = {
  id: rentalTestIds.contract,
  propertyId: rentalTestIds.property,
  propertyName: "测试房产",
  contractNumber: "RC-2026-000001",
  externalContractNumber: null,
  lifecycleStatus: "cancelled",
  displayStatus: "cancelled",
  startDate: "2026-09-15",
  endDate: "2026-12-31",
  actualEndDate: "2026-12-31",
  rentAmountMinor: 10000,
  tenantNames: ["测试租户"],
  spaceNames: ["测试房间"],
  updatedAt: "2026-08-31T04:00:00.000Z",
  billingAnchor: "contract_start",
  paymentIntervalMonths: 1,
  dueDaysBefore: 0,
  hasScheduledTermination: false,
  renewedFromContractId: null,
  cancellationReason: "提前取消",
  terminationDate: null,
  terminationReason: null,
  note: null,
  spaces: [
    {
      spaceId: rentalTestIds.childSpace,
      spaceName: "测试房间",
      spaceCode: null,
      spacePath: [
        { id: rentalTestIds.parentSpace, name: "测试楼栋" },
        { id: rentalTestIds.childSpace, name: "测试房间" },
      ],
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
  createdAt: "2026-08-31T04:00:00.000Z",
} as const;

const CHANGE_PARTIES_CONTRACT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-000000000501";
const CHANGE_PARTIES_TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";
const CHANGE_PARTIES_EFFECTIVE_DATE = "2026-09-01";
const CHANGE_PARTIES_REASON = "固定承租方变更";
type ChangePartiesFixtureOptions = {
  effectiveDate?: string;
  newValidFrom?: string;
  newValidTo?: string;
  oldValidTo?: string;
  keepOldPeriod?: boolean;
};
const CHANGE_PARTIES_RESPONSE = {
  id: CHANGE_PARTIES_CONTRACT_ID,
  propertyId: rentalTestIds.property,
  propertyName: "测试房产",
  contractNumber: "RC-2026-000501",
  externalContractNumber: null,
  lifecycleStatus: "confirmed",
  displayStatus: "active",
  startDate: "2026-08-01",
  endDate: "2026-12-31",
  actualEndDate: "2026-12-31",
  rentAmountMinor: 10000,
  tenantNames: ["变更后租户"],
  spaceNames: ["测试房间"],
  updatedAt: "2026-08-31T04:00:00.000Z",
  billingAnchor: "contract_start",
  paymentIntervalMonths: 1,
  dueDaysBefore: 0,
  hasScheduledTermination: false,
  renewedFromContractId: null,
  cancellationReason: null,
  terminationDate: null,
  terminationReason: null,
  note: "固定合同备注",
  spaces: [
    {
      spaceId: rentalTestIds.childSpace,
      spaceName: "测试房间",
      spaceCode: null,
      spacePath: [
        { id: rentalTestIds.parentSpace, name: "测试楼栋" },
        { id: rentalTestIds.childSpace, name: "测试房间" },
      ],
      rentAllocationMinor: null,
    },
  ],
  parties: [
    {
      tenantId: CHANGE_PARTIES_TENANT_ID,
      type: "individual",
      name: "变更后租户",
      phone: "13800000009",
      email: "changed@example.com",
      primaryContactName: null,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      validFrom: CHANGE_PARTIES_EFFECTIVE_DATE,
      validTo: "2026-12-31",
      isPrimaryPayer: true,
    },
  ],
  depositTerms: [],
  createdAt: "2026-08-01T00:00:00.000Z",
} as const;
const START_CHANGE_PARTIES_RESPONSE = {
  ...CHANGE_PARTIES_RESPONSE,
  parties: [
    {
      tenantId: CHANGE_PARTIES_TENANT_ID,
      type: "individual",
      name: "变更后租户",
      phone: "13800000009",
      email: "changed@example.com",
      primaryContactName: null,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      validFrom: "2026-08-01",
      validTo: "2026-12-31",
      isPrimaryPayer: true,
    },
  ],
} as const;
const END_CHANGE_PARTIES_RESPONSE = {
  ...CHANGE_PARTIES_RESPONSE,
  parties: [
    {
      tenantId: CHANGE_PARTIES_TENANT_ID,
      type: "individual",
      name: "变更后租户",
      phone: "13800000009",
      email: "changed@example.com",
      primaryContactName: null,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      validFrom: "2026-12-31",
      validTo: "2026-12-31",
      isPrimaryPayer: true,
    },
  ],
} as const;

const EXPECTED_CHANGE_PARTIES_PERIODS = [
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
    validFrom: "2026-08-01",
    validTo: "2026-08-31",
    isPrimaryPayer: true,
    identitySnapshotCiphertext: null,
    identitySnapshotKeyVersion: null,
  },
  {
    tenantId: CHANGE_PARTIES_TENANT_ID,
    tenantType: "individual",
    tenantName: "变更后租户",
    phone: "13800000009",
    email: "changed@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id",
    documentTypeOtherName: null,
    maskedDocumentNumber: null,
    validFrom: CHANGE_PARTIES_EFFECTIVE_DATE,
    validTo: "2026-12-31",
    isPrimaryPayer: true,
    identitySnapshotCiphertext: null,
    identitySnapshotKeyVersion: null,
  },
] as const;

function expectChangePartiesSuccessState(
  setup: TestAppHarness,
  before: ReturnType<typeof snapshotTransactionState>,
  actorUserId: string,
): void {
  expect(setup.state.rental.contracts).toEqual(before.rental.contracts);
  expect(setup.state.rental.contractSpaces).toEqual(before.rental.contractSpaces);
  expect(setup.state.rental.deposits).toEqual(new Map());
  expect(setup.state.rental.snapshots).toEqual(new Map());
  expect(setup.state.rental.actions).toEqual(new Map());
  expect(setup.state.rental.contractCounters).toEqual(new Map());
  expect(setup.state.rental.partyPeriods.get(CHANGE_PARTIES_CONTRACT_ID)).toEqual(
    EXPECTED_CHANGE_PARTIES_PERIODS,
  );
  expect(setup.state.rental.changes.get(CHANGE_PARTIES_CONTRACT_ID)).toEqual([
    {
      id: "cccccccc-cccc-4ccc-8ccc-000000000501",
      organizationId: testIds.organization,
      contractId: CHANGE_PARTIES_CONTRACT_ID,
      type: "parties_changed",
      effectiveDate: CHANGE_PARTIES_EFFECTIVE_DATE,
      reason: CHANGE_PARTIES_REASON,
      beforePartyRefs: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
      afterPartyRefs: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
      createdByUserId: actorUserId,
    },
  ]);
  expect(setup.state.rental.auditEntries).toEqual([
    {
      action: "rental_contract.parties_changed",
      targetId: CHANGE_PARTIES_CONTRACT_ID,
      metadata: {
        parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
      },
    },
  ]);
  expect(setup.state.auditLogs).toHaveLength(before.auditLogs.length + 1);
  expect(setup.state.auditLogs.at(-1)).toMatchObject({
    organizationId: testIds.organization,
    actorUserId,
    action: "rental_contract.parties_changed",
    targetId: CHANGE_PARTIES_CONTRACT_ID,
    targetType: "rental_contract",
    result: "succeeded",
    metadata: {
      parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
    },
  });
  expect(setup.state.auditLogs.at(-1)?.metadata).toEqual({
    parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
  });
  expect(setup.state.rental.nextPropertyId).toBe(1);
  expect(setup.state.rental.nextSpaceId).toBe(1);
  expect(setup.state.rental.nextLedgerId).toBe(1);
  expect(setup.state.rental.nextTenantId).toBe(1);
  expect(setup.state.rental.nextContractId).toBe(1);
  expect(setup.state.rental.nextContractSpaceId).toBe(1);
  expect(setup.state.rental.nextPartyPeriodId).toBe(2);
  expect(setup.state.rental.nextChangeId).toBe(2);
  expect(setup.state.rental.nextDepositId).toBe(1);
  expect(setup.state.rental.nextSnapshotId).toBe(1);
  expect(setup.state.rental.nextActionId).toBe(1);
  expect(setup.state.bookkeeping.ledgers).toEqual(before.bookkeeping.ledgers);
  expect(setup.state.bookkeeping.accounts).toEqual(before.bookkeeping.accounts);
  expect(setup.state.bookkeeping.categories).toEqual(before.bookkeeping.categories);
  expect(setup.state.bookkeeping.transactions).toEqual(before.bookkeeping.transactions);
  expect(setup.state.bookkeeping.movements).toEqual(before.bookkeeping.movements);
  expect(setup.state.bookkeeping.nextAccountId).toBe(1);
  expect(setup.state.bookkeeping.nextCategoryId).toBe(1);
  expect(setup.state.bookkeeping.nextTransactionId).toBe(1);
}

const TERMINATION_REASON = "固定提前终止";
const REVOCATION_REASON = "固定撤销终止";

function terminationPartyPeriod(validTo: string) {
  return {
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
    validFrom: "2026-08-01",
    validTo,
    isPrimaryPayer: true,
    identitySnapshotCiphertext: null,
    identitySnapshotKeyVersion: null,
  };
}

function terminationDetail(
  status: "confirmed" | "terminated",
  actualEndDate: string,
  displayStatus: "active" | "expiring_soon" | "terminated",
  spaceId: string = rentalTestIds.childSpace,
  spaceName = "测试空间",
  spacePath = [
    { id: rentalTestIds.parentSpace, name: "测试楼栋" },
    { id: rentalTestIds.childSpace, name: "测试空间" },
  ],
): RentalContractDetailRecord {
  return {
    id: rentalTestIds.contract,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000001",
    externalContractNumber: null,
    startDate: "2026-08-01",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    updatedAt: new Date(FIXED_RENTAL_NOW),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancellationReason: null,
    propertyName: "测试房产",
    lifecycleStatus: status,
    displayStatus,
    actualEndDate: actualEndDate,
    note: "朝南",
    tenantNames: ["测试租户"],
    spaceNames: [spaceName],
    hasScheduledTermination: status === "terminated" && actualEndDate >= "2026-08-31",
    terminationDate: status === "terminated" ? actualEndDate : null,
    terminationReason: status === "terminated" ? TERMINATION_REASON : null,
    spaces: [
      {
        spaceId,
        spaceName,
        spaceCode: null,
        spacePath,
        rentAllocationMinor: null,
      },
    ],
    parties: [terminationPartyPeriod(actualEndDate)],
    depositTerms: [],
  };
}

function terminationResponse(actualEndDate: string, displayStatus: "terminated" | "expiring_soon") {
  return {
    id: rentalTestIds.contract,
    propertyId: rentalTestIds.property,
    propertyName: "测试房产",
    contractNumber: "RC-2026-000001",
    externalContractNumber: null,
    lifecycleStatus: "terminated",
    displayStatus,
    startDate: "2026-08-01",
    endDate: "2026-12-31",
    actualEndDate,
    rentAmountMinor: 10000,
    tenantNames: ["测试租户"],
    spaceNames: ["测试空间"],
    updatedAt: "2026-08-31T04:00:00.000Z",
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    hasScheduledTermination: displayStatus === "expiring_soon",
    renewedFromContractId: null,
    cancellationReason: null,
    terminationDate: actualEndDate,
    terminationReason: TERMINATION_REASON,
    note: "朝南",
    spaces: [
      {
        spaceId: rentalTestIds.childSpace,
        spaceName: "测试空间",
        spaceCode: null,
        spacePath: [
          { id: rentalTestIds.parentSpace, name: "测试楼栋" },
          { id: rentalTestIds.childSpace, name: "测试空间" },
        ],
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
        validFrom: "2026-08-01",
        validTo: actualEndDate,
        isPrimaryPayer: true,
      },
    ],
    depositTerms: [],
    createdAt: "2026-08-01T00:00:00.000Z",
  } as const;
}

function registerTerminationFixtures(
  setup: TestAppHarness,
  terminationDate: string,
  actorUserId: string = testIds.ownerUser,
): void {
  const current = setup.state.rental.contracts.get(rentalTestIds.contract);
  const property = setup.state.rental.properties.get(rentalTestIds.property);
  const tenant = setup.state.rental.tenants.get(rentalTestIds.tenant);
  const space = setup.state.rental.spaces.get(rentalTestIds.childSpace);
  if (!current || !property || !tenant || !space) throw new Error("Expected termination fixtures");
  const contract = {
    ...current,
    status: "confirmed" as const,
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
  const after = {
    ...contract,
    status: "terminated" as const,
    terminationDate,
    terminationRecordedAt: new Date(FIXED_RENTAL_NOW),
    terminatedByUserId: actorUserId,
    terminationReason: TERMINATION_REASON,
    updatedByUserId: actorUserId,
  };
  const beforeDetail = terminationDetail("confirmed", "2026-12-31", "active");
  const afterDetail = terminationDetail(
    "terminated",
    terminationDate,
    terminationDate < "2026-08-31" ? "terminated" : "expiring_soon",
  );
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
  setup.state.rentalQuery.registerReadSequence(
    "contracts.detail",
    [testIds.organization, rentalTestIds.contract, "2026-08-31"],
    [beforeDetail, afterDetail],
  );
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, rentalTestIds.property],
    property,
  );
  setup.state.rentalQuery.registerRead(
    "tenants.findForUpdate",
    [testIds.organization, rentalTestIds.tenant],
    tenant,
  );
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, rentalTestIds.property, rentalTestIds.childSpace],
    space,
  );
  setup.state.rentalQuery.registerSpaceConflict(
    {
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      spaceIds: [rentalTestIds.childSpace],
      startDate: terminationDate,
      endDate: "2026-12-31",
      excludeContractId: rentalTestIds.contract,
    },
    [],
  );
  setup.state.rentalMutation.registerMutation(
    "relations.clipPartyPeriodsToActualEnd",
    {
      organizationId: testIds.organization,
      contractId: rentalTestIds.contract,
      actualEnd: terminationDate,
    },
    {
      partyPeriods: {
        contractId: rentalTestIds.contract,
        rows: [terminationPartyPeriod(terminationDate)],
      },
    },
  );
  setup.state.rentalMutation.registerMutation(
    "contracts.setLifecycle",
    {
      organizationId: testIds.organization,
      id: rentalTestIds.contract,
      status: "terminated",
      expectedStatus: "confirmed",
      terminationDate,
      terminationRecordedAt: new Date(FIXED_RENTAL_NOW),
      terminatedByUserId: actorUserId,
      terminationReason: TERMINATION_REASON,
      updatedByUserId: actorUserId,
    },
    { contract: { id: rentalTestIds.contract, row: after } },
  );
}

function registerInvalidTerminationFixture(
  setup: TestAppHarness,
  status: "draft" | "terminated",
): void {
  const contract = setup.state.rental.contracts.get(rentalTestIds.contract);
  const property = setup.state.rental.properties.get(rentalTestIds.property);
  if (!contract || !property) throw new Error("Expected invalid termination fixtures");
  const row = {
    ...contract,
    status,
    terminationDate: status === "terminated" ? "2026-09-15" : null,
    terminationRecordedAt: status === "terminated" ? new Date(FIXED_RENTAL_NOW) : null,
    terminatedByUserId: status === "terminated" ? testIds.ownerUser : null,
    terminationReason: status === "terminated" ? TERMINATION_REASON : null,
  };
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, rentalTestIds.contract],
    row,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, rentalTestIds.contract],
    row,
  );
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, rentalTestIds.property],
    property,
  );
}

function expectTerminationSuccessState(
  setup: TestAppHarness,
  before: ReturnType<typeof snapshotTransactionState>,
  terminationDate: string,
  actorUserId: string,
): void {
  expect(setup.state.rental.contracts.get(rentalTestIds.contract)).toEqual({
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: null,
    status: "terminated",
    startDate: "2026-08-01",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    terminationDate,
    terminationRecordedAt: new Date(FIXED_RENTAL_NOW),
    terminatedByUserId: actorUserId,
    terminationReason: TERMINATION_REASON,
    note: null,
    createdByUserId: testIds.ownerUser,
    updatedByUserId: actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  });
  expect(setup.state.rental.contractSpaces).toEqual(
    new Map([
      [
        rentalTestIds.contract,
        [
          {
            spaceId: rentalTestIds.childSpace,
            spaceName: "测试房间",
            spaceCode: null,
            spacePath: [
              { id: rentalTestIds.parentSpace, name: "测试楼栋" },
              { id: rentalTestIds.childSpace, name: "测试房间" },
            ],
            rentAllocationMinor: null,
          },
        ],
      ],
    ]),
  );
  expect(setup.state.rental.deposits).toEqual(new Map());
  expect(setup.state.rental.snapshots).toEqual(new Map());
  expect(setup.state.rental.changes).toEqual(new Map());
  expect(setup.state.rental.partyPeriods.get(rentalTestIds.contract)).toEqual([
    terminationPartyPeriod(terminationDate),
  ]);
  expect(setup.state.rental.actions).toEqual(new Map());
  expect(setup.state.rental.contractCounters).toEqual(new Map());
  expect(setup.state.rental.auditEntries).toEqual([
    {
      action: "rental_contract.terminated",
      targetId: rentalTestIds.contract,
      metadata: { terminationDate },
    },
  ]);
  expect(setup.state.auditLogs.at(-1)).toEqual({
    id: expect.any(String),
    organizationId: testIds.organization,
    actorUserId,
    action: "rental_contract.terminated",
    targetType: "rental_contract",
    targetId: rentalTestIds.contract,
    result: "succeeded",
    metadata: { terminationDate },
    requestId: expect.any(String),
    createdAt: expect.any(Date),
  });
  expect(setup.state.auditLogs.at(-1)?.metadata).toEqual({ terminationDate });
  expect(setup.state.rental.nextPropertyId).toBe(1);
  expect(setup.state.rental.nextSpaceId).toBe(1);
  expect(setup.state.rental.nextLedgerId).toBe(1);
  expect(setup.state.rental.nextTenantId).toBe(1);
  expect(setup.state.rental.nextContractId).toBe(1);
  expect(setup.state.rental.nextContractSpaceId).toBe(1);
  expect(setup.state.rental.nextPartyPeriodId).toBe(1);
  expect(setup.state.rental.nextChangeId).toBe(1);
  expect(setup.state.rental.nextDepositId).toBe(1);
  expect(setup.state.rental.nextSnapshotId).toBe(1);
  expect(setup.state.rental.nextActionId).toBe(1);
  expect(setup.state.bookkeeping.ledgers).toEqual(before.bookkeeping.ledgers);
  expect(setup.state.bookkeeping.accounts).toEqual(before.bookkeeping.accounts);
  expect(setup.state.bookkeeping.categories).toEqual(before.bookkeeping.categories);
  expect(setup.state.bookkeeping.transactions).toEqual(before.bookkeeping.transactions);
  expect(setup.state.bookkeeping.movements).toEqual(before.bookkeeping.movements);
  expect(setup.state.bookkeeping.nextAccountId).toBe(1);
  expect(setup.state.bookkeeping.nextCategoryId).toBe(1);
  expect(setup.state.bookkeeping.nextTransactionId).toBe(1);
}

function restoredContractResponse() {
  const response = terminationResponse("2026-12-31", "expiring_soon");
  return {
    ...response,
    lifecycleStatus: "confirmed",
    displayStatus: "active",
    hasScheduledTermination: false,
    terminationDate: null,
    terminationReason: null,
    parties: [
      {
        ...response.parties[0],
        validTo: "2026-12-31",
      },
    ],
  } as const;
}

function expectRevokeSuccessState(
  setup: TestAppHarness,
  before: ReturnType<typeof snapshotTransactionState>,
  actorUserId: string,
): void {
  expect(setup.state.rental.contracts.get(rentalTestIds.contract)).toEqual({
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: null,
    status: "confirmed",
    startDate: "2026-08-01",
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
    updatedByUserId: actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  });
  expect(setup.state.rental.contractSpaces).toEqual(
    new Map([
      [
        rentalTestIds.contract,
        [
          {
            spaceId: rentalTestIds.childSpace,
            spaceName: "测试房间",
            spaceCode: null,
            spacePath: [
              { id: rentalTestIds.parentSpace, name: "测试楼栋" },
              { id: rentalTestIds.childSpace, name: "测试房间" },
            ],
            rentAllocationMinor: null,
          },
        ],
      ],
    ]),
  );
  expect(setup.state.rental.deposits).toEqual(new Map());
  expect(setup.state.rental.snapshots).toEqual(new Map());
  expect(setup.state.rental.partyPeriods.get(rentalTestIds.contract)).toEqual([
    terminationPartyPeriod("2026-12-31"),
  ]);
  expect(setup.state.rental.changes).toEqual(new Map());
  expect(setup.state.rental.actions.get(rentalTestIds.contract)).toEqual([
    {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      organizationId: testIds.organization,
      contractId: rentalTestIds.contract,
      type: "termination_revoked",
      reason: REVOCATION_REASON,
      terminationDateBeforeRevoke: "2026-09-15",
      createdByUserId: actorUserId,
    },
  ]);
  expect(setup.state.rental.contractCounters).toEqual(new Map());
  expect(setup.state.rental.auditEntries).toEqual([
    {
      action: "rental_contract.termination_revoked",
      targetId: rentalTestIds.contract,
      metadata: { terminationDate: "2026-09-15" },
    },
  ]);
  expect(setup.state.auditLogs.at(-1)).toEqual({
    id: expect.any(String),
    organizationId: testIds.organization,
    actorUserId,
    action: "rental_contract.termination_revoked",
    targetType: "rental_contract",
    targetId: rentalTestIds.contract,
    result: "succeeded",
    metadata: { terminationDate: "2026-09-15" },
    requestId: expect.any(String),
    createdAt: expect.any(Date),
  });
  expect(setup.state.rental.nextPropertyId).toBe(1);
  expect(setup.state.rental.nextSpaceId).toBe(1);
  expect(setup.state.rental.nextLedgerId).toBe(1);
  expect(setup.state.rental.nextTenantId).toBe(1);
  expect(setup.state.rental.nextContractId).toBe(1);
  expect(setup.state.rental.nextContractSpaceId).toBe(1);
  expect(setup.state.rental.nextPartyPeriodId).toBe(1);
  expect(setup.state.rental.nextChangeId).toBe(1);
  expect(setup.state.rental.nextDepositId).toBe(1);
  expect(setup.state.rental.nextSnapshotId).toBe(1);
  expect(setup.state.rental.nextActionId).toBe(2);
  expect(setup.state.bookkeeping.ledgers).toEqual(before.bookkeeping.ledgers);
  expect(setup.state.bookkeeping.accounts).toEqual(before.bookkeeping.accounts);
  expect(setup.state.bookkeeping.categories).toEqual(before.bookkeeping.categories);
  expect(setup.state.bookkeeping.transactions).toEqual(before.bookkeeping.transactions);
  expect(setup.state.bookkeeping.movements).toEqual(before.bookkeeping.movements);
  expect(setup.state.bookkeeping.nextAccountId).toBe(1);
  expect(setup.state.bookkeeping.nextCategoryId).toBe(1);
  expect(setup.state.bookkeeping.nextTransactionId).toBe(1);
}

function registerRevokeFixtures(
  setup: TestAppHarness,
  actorUserId: string = testIds.ownerUser,
  topology: "successor" | "ancestor" | "descendant" = "successor",
): void {
  const requestedSpaceId =
    topology === "descendant" ? rentalTestIds.parentSpace : rentalTestIds.childSpace;
  const detailSpaceName = requestedSpaceId === rentalTestIds.parentSpace ? "测试楼栋" : "测试空间";
  const detailSpacePath =
    requestedSpaceId === rentalTestIds.parentSpace
      ? [{ id: rentalTestIds.parentSpace, name: "测试楼栋" }]
      : [
          { id: rentalTestIds.parentSpace, name: "测试楼栋" },
          { id: rentalTestIds.childSpace, name: "测试空间" },
        ];
  const current = setup.state.rental.contracts.get(rentalTestIds.contract);
  const property = setup.state.rental.properties.get(rentalTestIds.property);
  const tenant = setup.state.rental.tenants.get(rentalTestIds.tenant);
  const space = setup.state.rental.spaces.get(requestedSpaceId);
  if (!current || !property || !tenant || !space) throw new Error("Expected revoke fixtures");
  const terminated = {
    ...current,
    status: "terminated" as const,
    terminationDate: "2026-09-15",
    terminationRecordedAt: new Date(FIXED_RENTAL_NOW),
    terminatedByUserId: testIds.ownerUser,
    terminationReason: TERMINATION_REASON,
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
  const restored = {
    ...terminated,
    status: "confirmed" as const,
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    updatedByUserId: actorUserId,
  };
  setup.state.rental.contracts.set(rentalTestIds.contract, terminated);
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, rentalTestIds.contract],
    terminated,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, rentalTestIds.contract],
    terminated,
  );
  setup.state.rentalQuery.registerReadSequence(
    "contracts.detail",
    [testIds.organization, rentalTestIds.contract, "2026-08-31"],
    [
      terminationDetail(
        "terminated",
        "2026-09-15",
        "expiring_soon",
        requestedSpaceId,
        detailSpaceName,
        detailSpacePath,
      ),
      terminationDetail(
        "confirmed",
        "2026-12-31",
        "active",
        requestedSpaceId,
        detailSpaceName,
        detailSpacePath,
      ),
    ],
  );
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, rentalTestIds.property],
    property,
  );
  setup.state.rentalQuery.registerRead(
    "tenants.findForUpdate",
    [testIds.organization, rentalTestIds.tenant],
    tenant,
  );
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, rentalTestIds.property, requestedSpaceId],
    space,
  );
  setup.state.rentalQuery.registerRead(
    "spaces.ancestors",
    [testIds.organization, rentalTestIds.property, requestedSpaceId],
    detailSpacePath,
  );
  setup.state.rentalQuery.registerSpaceConflict(
    {
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      spaceIds: [requestedSpaceId],
      startDate: "2026-09-16",
      endDate: "2026-12-31",
      excludeContractId: rentalTestIds.contract,
    },
    [],
  );
  setup.state.rentalMutation.registerMutation(
    "relations.restoreTerminalPartyPeriods",
    {
      organizationId: testIds.organization,
      contractId: rentalTestIds.contract,
      terminatedAt: "2026-09-15",
      originalEnd: "2026-12-31",
    },
    {
      partyPeriods: {
        contractId: rentalTestIds.contract,
        rows: [terminationPartyPeriod("2026-12-31")],
      },
    },
  );
  setup.state.rentalMutation.registerMutation(
    "contracts.setLifecycle",
    {
      organizationId: testIds.organization,
      id: rentalTestIds.contract,
      status: "confirmed",
      expectedStatus: "terminated",
      terminationDate: null,
      terminationRecordedAt: null,
      terminatedByUserId: null,
      terminationReason: null,
      updatedByUserId: actorUserId,
    },
    { contract: { id: rentalTestIds.contract, row: restored } },
  );
  setup.state.rentalMutation.registerMutation(
    "relations.appendTerminationRevocation",
    {
      organizationId: testIds.organization,
      contractId: rentalTestIds.contract,
      reason: REVOCATION_REASON,
      terminationDateBeforeRevoke: "2026-09-15",
      createdByUserId: actorUserId,
    },
    {
      actions: {
        contractId: rentalTestIds.contract,
        rows: [
          {
            id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            organizationId: testIds.organization,
            contractId: rentalTestIds.contract,
            type: "termination_revoked",
            reason: REVOCATION_REASON,
            terminationDateBeforeRevoke: "2026-09-15",
            createdByUserId: actorUserId,
          },
        ],
      },
      counterEffects: { nextActionId: 1 },
    },
  );
}

const RENEWAL_CONTRACT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const RENEWAL_DEPOSIT_ID = "dddddddd-dddd-4ddd-8ddd-000000000001";

type RenewalSourceKind = "confirmed" | "terminated";

const RENEWAL_PARTY_PERIOD = {
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
  validFrom: "2026-08-01",
  validTo: "2027-12-31",
  isPrimaryPayer: true,
  identitySnapshotCiphertext: Buffer.from("renewal-fixed-ciphertext"),
  identitySnapshotKeyVersion: 1,
};

const RENEWAL_DEPOSIT = {
  id: RENEWAL_DEPOSIT_ID,
  type: "rental" as const,
  customName: null,
  calculationMode: "fixed_amount" as const,
  fixedAmountMinor: 50000,
  rentMultiple: null,
  finalAmountMinor: null,
  sortOrder: 0,
};

const RENEWAL_SOURCE_DEPOSIT = { ...RENEWAL_DEPOSIT, finalAmountMinor: 50000 };

function renewalPartyPeriod(source: RenewalSourceKind) {
  return { ...RENEWAL_PARTY_PERIOD, validTo: renewalSourceDates(source).endDate };
}

function renewalSourcePartyPeriod(source: RenewalSourceKind) {
  return { ...RENEWAL_PARTY_PERIOD, validTo: renewalSourceDates(source).actualEnd };
}

function renewalSourceDates(source: RenewalSourceKind): {
  actualEnd: string;
  startDate: string;
  endDate: string;
} {
  return source === "terminated"
    ? { actualEnd: "2026-09-15", startDate: "2026-09-16", endDate: "2027-09-15" }
    : { actualEnd: "2026-12-31", startDate: "2027-01-01", endDate: "2027-12-31" };
}

function renewalSourceContract(source: RenewalSourceKind): RentalContractRecord {
  const terminated = source === "terminated";
  return {
    id: rentalTestIds.contract,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: "EXT-RENEW-001",
    status: source,
    startDate: "2026-08-01",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    terminationDate: terminated ? "2026-09-15" : null,
    terminationRecordedAt: terminated ? new Date(FIXED_RENTAL_NOW) : null,
    terminatedByUserId: terminated ? testIds.ownerUser : null,
    terminationReason: terminated ? TERMINATION_REASON : null,
    note: "续租备注",
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
}

function renewalSourceDetail(source: RenewalSourceKind): RentalContractDetailRecord {
  const dates = renewalSourceDates(source);
  const terminated = source === "terminated";
  return {
    id: rentalTestIds.contract,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000900",
    externalContractNumber: "EXT-RENEW-001",
    startDate: "2026-08-01",
    endDate: "2026-12-31",
    rentAmountMinor: 10000,
    updatedAt: new Date(FIXED_RENTAL_NOW),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: null,
    cancellationReason: null,
    propertyName: "测试房产",
    lifecycleStatus: source,
    displayStatus: terminated ? "expiring_soon" : "active",
    actualEndDate: dates.actualEnd,
    note: "续租备注",
    tenantNames: ["测试租户"],
    spaceNames: ["测试房间"],
    hasScheduledTermination: terminated,
    terminationDate: terminated ? "2026-09-15" : null,
    terminationReason: terminated ? TERMINATION_REASON : null,
    spaces: [
      {
        spaceId: rentalTestIds.childSpace,
        spaceName: "测试房间",
        spaceCode: null,
        spacePath: [
          { id: rentalTestIds.parentSpace, name: "测试楼栋" },
          { id: rentalTestIds.childSpace, name: "测试房间" },
        ],
        rentAllocationMinor: 10000,
      },
    ],
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
        validFrom: "2026-08-01",
        validTo: dates.actualEnd,
        isPrimaryPayer: true,
      },
    ],
    depositTerms: [RENEWAL_SOURCE_DEPOSIT],
  };
}

function renewalDraftContract(
  source: RenewalSourceKind,
  actorUserId: string,
): RentalContractRecord {
  const dates = renewalSourceDates(source);
  return {
    id: RENEWAL_CONTRACT_ID,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000001",
    externalContractNumber: "EXT-RENEW-001",
    status: "draft",
    startDate: dates.startDate,
    endDate: dates.endDate,
    rentAmountMinor: 10000,
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: rentalTestIds.contract,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    terminationDate: null,
    terminationRecordedAt: null,
    terminatedByUserId: null,
    terminationReason: null,
    note: "续租备注",
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date(FIXED_RENTAL_NOW),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
}

function renewalDraftDetail(source: RenewalSourceKind): RentalContractDetailRecord {
  const dates = renewalSourceDates(source);
  return {
    id: RENEWAL_CONTRACT_ID,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000001",
    externalContractNumber: "EXT-RENEW-001",
    startDate: dates.startDate,
    endDate: dates.endDate,
    rentAmountMinor: 10000,
    updatedAt: new Date(FIXED_RENTAL_NOW),
    createdAt: new Date(FIXED_RENTAL_NOW),
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    renewedFromContractId: rentalTestIds.contract,
    cancellationReason: null,
    propertyName: "测试房产",
    lifecycleStatus: "draft",
    displayStatus: "upcoming",
    actualEndDate: dates.endDate,
    note: "续租备注",
    tenantNames: ["测试租户"],
    spaceNames: ["测试房间"],
    hasScheduledTermination: false,
    terminationDate: null,
    terminationReason: null,
    spaces: [
      {
        spaceId: rentalTestIds.childSpace,
        spaceName: "测试房间",
        spaceCode: null,
        spacePath: [
          { id: rentalTestIds.parentSpace, name: "测试楼栋" },
          { id: rentalTestIds.childSpace, name: "测试房间" },
        ],
        rentAllocationMinor: 10000,
      },
    ],
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
        validFrom: dates.startDate,
        validTo: dates.endDate,
        isPrimaryPayer: true,
      },
    ],
    depositTerms: [RENEWAL_DEPOSIT],
  };
}

function registerRenewFixtures(
  setup: TestAppHarness,
  source: RenewalSourceKind,
  actorUserId: string = testIds.ownerUser,
): void {
  const sourceContract = renewalSourceContract(source);
  const draft = renewalDraftContract(source, actorUserId);
  const sourceDates = renewalSourceDates(source);
  setup.state.rental.partyPeriods.set(rentalTestIds.contract, [renewalSourcePartyPeriod(source)]);
  setup.state.rental.deposits.set(rentalTestIds.contract, [RENEWAL_SOURCE_DEPOSIT]);
  const createInput = {
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000001",
    externalContractNumber: "EXT-RENEW-001",
    startDate: sourceDates.startDate,
    endDate: sourceDates.endDate,
    rentAmountMinor: 10000,
    billingAnchor: "contract_start" as const,
    paymentIntervalMonths: 1 as const,
    dueDaysBefore: 0,
    renewedFromContractId: rentalTestIds.contract,
    note: "续租备注",
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
  };
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, rentalTestIds.contract],
    sourceContract,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, rentalTestIds.contract],
    sourceContract,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.detail",
    [testIds.organization, rentalTestIds.contract, "2026-08-31"],
    renewalSourceDetail(source),
  );
  setup.state.rentalQuery.registerRead(
    "contracts.detail",
    [testIds.organization, RENEWAL_CONTRACT_ID, "2026-08-31"],
    renewalDraftDetail(source),
  );
  setup.state.rentalQuery.registerRead(
    "contracts.nextContractNumber",
    [testIds.organization, 2026],
    { contractNumber: "RC-2026-000001", counter: 1 },
  );
  setup.state.rentalQuery.registerSpaceConflict(
    {
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      spaceIds: [rentalTestIds.childSpace],
      startDate: sourceDates.startDate,
      endDate: sourceDates.endDate,
    },
    [],
  );
  setup.state.rentalMutation.registerMutation("contracts.createDraft", createInput, {
    contract: { id: RENEWAL_CONTRACT_ID, row: draft },
    counterEffects: { nextContractId: 1 },
  });
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftSpaces",
    {
      organizationId: testIds.organization,
      contractId: RENEWAL_CONTRACT_ID,
      propertyId: rentalTestIds.property,
      spaces: [{ spaceId: rentalTestIds.childSpace, rentAllocationMinor: 10000 }],
    },
    {
      contractSpaces: {
        contractId: RENEWAL_CONTRACT_ID,
        rows: renewalDraftDetail(source).spaces,
      },
      counterEffects: { nextContractSpaceId: 1 },
    },
  );
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftDeposits",
    {
      organizationId: testIds.organization,
      contractId: RENEWAL_CONTRACT_ID,
      deposits: [
        {
          type: "rental",
          customName: null,
          calculationMode: "fixed_amount",
          fixedAmountMinor: 50000,
          rentMultiple: null,
          sortOrder: 0,
        },
      ],
    },
    {
      deposits: { contractId: RENEWAL_CONTRACT_ID, rows: [RENEWAL_DEPOSIT] },
      counterEffects: { nextDepositId: 1 },
    },
  );
  setup.state.rentalMutation.registerMutation(
    "relations.copyTerminalPartySetToDraft",
    {
      organizationId: testIds.organization,
      contractId: rentalTestIds.contract,
      targetContractId: RENEWAL_CONTRACT_ID,
      validFrom: sourceDates.startDate,
      validTo: sourceDates.endDate,
    },
    {
      partyPeriods: {
        contractId: RENEWAL_CONTRACT_ID,
        rows: [renewalPartyPeriod(source)],
      },
      counterEffects: { nextPartyPeriodId: 1 },
    },
  );
}

function renewalResponse(source: RenewalSourceKind) {
  const dates = renewalSourceDates(source);
  return {
    id: RENEWAL_CONTRACT_ID,
    propertyId: rentalTestIds.property,
    propertyName: "测试房产",
    contractNumber: "RC-2026-000001",
    externalContractNumber: "EXT-RENEW-001",
    lifecycleStatus: "draft",
    displayStatus: "upcoming",
    startDate: dates.startDate,
    endDate: dates.endDate,
    actualEndDate: dates.endDate,
    rentAmountMinor: 10000,
    tenantNames: ["测试租户"],
    spaceNames: ["测试房间"],
    updatedAt: "2026-08-31T04:00:00.000Z",
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    hasScheduledTermination: false,
    renewedFromContractId: rentalTestIds.contract,
    cancellationReason: null,
    terminationDate: null,
    terminationReason: null,
    note: "续租备注",
    spaces: renewalDraftDetail(source).spaces,
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
        validFrom: dates.startDate,
        validTo: dates.endDate,
        isPrimaryPayer: true,
      },
    ],
    depositTerms: [RENEWAL_DEPOSIT],
    createdAt: "2026-08-31T04:00:00.000Z",
  } as const;
}

function expectRenewalSuccessState(
  setup: TestAppHarness,
  before: ReturnType<typeof snapshotTransactionState>,
  source: RenewalSourceKind,
  actorUserId: string,
): void {
  expect(setup.state.rental.contracts.get(rentalTestIds.contract)).toEqual(
    before.rental.contracts.get(rentalTestIds.contract),
  );
  expect(setup.state.rental.contracts.get(RENEWAL_CONTRACT_ID)).toEqual(
    renewalDraftContract(source, actorUserId),
  );
  expect(setup.state.rental.contractSpaces).toEqual(
    new Map([
      [
        rentalTestIds.contract,
        [
          {
            spaceId: rentalTestIds.childSpace,
            spaceName: "测试房间",
            spaceCode: null,
            spacePath: [
              { id: rentalTestIds.parentSpace, name: "测试楼栋" },
              { id: rentalTestIds.childSpace, name: "测试房间" },
            ],
            rentAllocationMinor: null,
          },
        ],
      ],
      [
        RENEWAL_CONTRACT_ID,
        [
          {
            spaceId: rentalTestIds.childSpace,
            spaceName: "测试房间",
            spaceCode: null,
            spacePath: [
              { id: rentalTestIds.parentSpace, name: "测试楼栋" },
              { id: rentalTestIds.childSpace, name: "测试房间" },
            ],
            rentAllocationMinor: 10000,
          },
        ],
      ],
    ]),
  );
  expect(setup.state.rental.partyPeriods).toEqual(
    new Map([
      [rentalTestIds.contract, [renewalSourcePartyPeriod(source)]],
      [RENEWAL_CONTRACT_ID, [renewalPartyPeriod(source)]],
    ]),
  );
  expect(setup.state.rental.deposits).toEqual(
    new Map([
      [rentalTestIds.contract, [RENEWAL_SOURCE_DEPOSIT]],
      [RENEWAL_CONTRACT_ID, [RENEWAL_DEPOSIT]],
    ]),
  );
  expect(setup.state.rental.snapshots).toEqual(new Map());
  expect(setup.state.rental.changes).toEqual(new Map());
  expect(setup.state.rental.actions).toEqual(new Map());
  expect(setup.state.rental.contractCounters).toEqual(
    new Map([[`${testIds.organization}/2026`, 1]]),
  );
  expect(setup.state.rental.nextContractId).toBe(2);
  expect(setup.state.rental.nextContractSpaceId).toBe(2);
  expect(setup.state.rental.nextPartyPeriodId).toBe(2);
  expect(setup.state.rental.nextDepositId).toBe(2);
  expect(setup.state.rental.nextPropertyId).toBe(1);
  expect(setup.state.rental.nextSpaceId).toBe(1);
  expect(setup.state.rental.nextLedgerId).toBe(1);
  expect(setup.state.rental.nextTenantId).toBe(1);
  expect(setup.state.rental.nextChangeId).toBe(1);
  expect(setup.state.rental.nextSnapshotId).toBe(1);
  expect(setup.state.rental.nextActionId).toBe(1);
  expect(setup.state.rental.auditEntries).toEqual([
    {
      action: "rental_contract.renewed",
      targetId: RENEWAL_CONTRACT_ID,
      metadata: { renewedFromContractId: rentalTestIds.contract },
    },
  ]);
  expect(setup.state.auditLogs.at(-1)).toEqual({
    id: expect.any(String),
    organizationId: testIds.organization,
    actorUserId,
    action: "rental_contract.renewed",
    targetType: "rental_contract",
    targetId: RENEWAL_CONTRACT_ID,
    result: "succeeded",
    metadata: { renewedFromContractId: rentalTestIds.contract },
    requestId: expect.any(String),
    createdAt: expect.any(Date),
  });
  expect(setup.state.bookkeeping.ledgers).toEqual(before.bookkeeping.ledgers);
  expect(setup.state.bookkeeping.accounts).toEqual(before.bookkeeping.accounts);
  expect(setup.state.bookkeeping.categories).toEqual(before.bookkeeping.categories);
  expect(setup.state.bookkeeping.transactions).toEqual(before.bookkeeping.transactions);
  expect(setup.state.bookkeeping.movements).toEqual(before.bookkeeping.movements);
  expect(setup.state.bookkeeping.nextAccountId).toBe(1);
  expect(setup.state.bookkeeping.nextCategoryId).toBe(1);
  expect(setup.state.bookkeeping.nextTransactionId).toBe(1);
}

function registerRenewInvalidSource(setup: TestAppHarness, status: "draft" | "cancelled"): void {
  const current = renewalSourceContract("confirmed");
  const invalid = { ...current, status } as RentalContractRecord;
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, rentalTestIds.contract],
    invalid,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, rentalTestIds.contract],
    invalid,
  );
}

function registerRenewConflict(setup: TestAppHarness, source: RenewalSourceKind): void {
  const dates = renewalSourceDates(source);
  setup.state.rentalQuery.registerSpaceConflict(
    {
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      spaceIds: [rentalTestIds.childSpace],
      startDate: dates.startDate,
      endDate: dates.endDate,
    },
    [
      {
        contractId: "bbbbbbbb-bbbb-4bbb-8bbb-000000000401",
        contractNumber: "RC-2026-000401",
        spaceId: rentalTestIds.childSpace,
      },
    ],
  );
}

function registerRenewConfirmFixtures(
  setup: TestAppHarness,
  currentTenant: RentalTenantRecord | null,
  actorUserId = testIds.ownerUser,
): void {
  const draft = renewalDraftContract("confirmed", actorUserId);
  const confirmed = {
    ...renewalDraftDetail("confirmed"),
    lifecycleStatus: "confirmed" as const,
    displayStatus: "active" as const,
    depositTerms: [RENEWAL_SOURCE_DEPOSIT],
  };
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, RENEWAL_CONTRACT_ID],
    draft,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, RENEWAL_CONTRACT_ID],
    draft,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.detail",
    [testIds.organization, RENEWAL_CONTRACT_ID, "2026-08-31"],
    confirmed,
  );
  setup.state.rentalQuery.registerRead(
    "tenants.findForUpdate",
    [testIds.organization, rentalTestIds.tenant],
    currentTenant,
  );
  setup.state.rentalQuery.registerSpaceConflict(
    {
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      spaceIds: [rentalTestIds.childSpace],
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      excludeContractId: RENEWAL_CONTRACT_ID,
    },
    [],
  );
  const confirmedParty = renewalPartyPeriod("confirmed");
  const confirmedDeposit = { ...RENEWAL_DEPOSIT, finalAmountMinor: 50000 };
  setup.state.rentalMutation.registerMutation(
    "relations.confirmSnapshots",
    { organizationId: testIds.organization, contractId: RENEWAL_CONTRACT_ID },
    {
      contractSpaces: {
        contractId: RENEWAL_CONTRACT_ID,
        rows: renewalDraftDetail("confirmed").spaces,
      },
      partyPeriods: { contractId: RENEWAL_CONTRACT_ID, rows: [confirmedParty] },
      deposits: { contractId: RENEWAL_CONTRACT_ID, rows: [confirmedDeposit] },
      snapshots: {
        contractId: RENEWAL_CONTRACT_ID,
        row: {
          contractId: RENEWAL_CONTRACT_ID,
          spaces: renewalDraftDetail("confirmed").spaces,
          parties: [confirmedParty],
          deposits: [confirmedDeposit],
        },
      },
    },
  );
  const lifecycleInput = {
    organizationId: testIds.organization,
    id: RENEWAL_CONTRACT_ID,
    status: "confirmed" as const,
    updatedByUserId: actorUserId,
  };
  setup.state.rentalMutation.registerMutation("contracts.setLifecycle", lifecycleInput, {
    contract: {
      id: RENEWAL_CONTRACT_ID,
      row: { ...draft, ...lifecycleInput, updatedAt: new Date(FIXED_RENTAL_NOW) },
    },
  });
}

function renewedConfirmedResponse() {
  return {
    id: RENEWAL_CONTRACT_ID,
    propertyId: rentalTestIds.property,
    propertyName: "测试房产",
    contractNumber: "RC-2026-000001",
    externalContractNumber: "EXT-RENEW-001",
    lifecycleStatus: "confirmed",
    displayStatus: "active",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    actualEndDate: "2027-12-31",
    rentAmountMinor: 10000,
    tenantNames: ["测试租户"],
    spaceNames: ["测试房间"],
    updatedAt: "2026-08-31T04:00:00.000Z",
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    dueDaysBefore: 0,
    hasScheduledTermination: false,
    renewedFromContractId: rentalTestIds.contract,
    cancellationReason: null,
    terminationDate: null,
    terminationReason: null,
    note: "续租备注",
    spaces: [
      {
        spaceId: rentalTestIds.childSpace,
        spaceName: "测试房间",
        spaceCode: null,
        spacePath: [
          { id: rentalTestIds.parentSpace, name: "测试楼栋" },
          { id: rentalTestIds.childSpace, name: "测试房间" },
        ],
        rentAllocationMinor: 10000,
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
        validFrom: "2027-01-01",
        validTo: "2027-12-31",
        isPrimaryPayer: true,
      },
    ],
    depositTerms: [RENEWAL_SOURCE_DEPOSIT],
    createdAt: "2026-08-31T04:00:00.000Z",
  } as const;
}

function registerChangePartiesFixture(
  setup: TestAppHarness,
  actorUserId: string,
  status: "confirmed" | "draft" = "confirmed",
  options: ChangePartiesFixtureOptions = {},
): void {
  const effectiveDate = options.effectiveDate ?? CHANGE_PARTIES_EFFECTIVE_DATE;
  const newValidFrom = options.newValidFrom ?? effectiveDate;
  const newValidTo = options.newValidTo ?? "2026-12-31";
  const oldValidTo = options.oldValidTo ?? "2026-08-31";
  const keepOldPeriod = options.keepOldPeriod ?? true;
  const contract: RentalContractRecord = {
    id: CHANGE_PARTIES_CONTRACT_ID,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    contractNumber: "RC-2026-000501",
    externalContractNumber: null,
    status,
    startDate: "2026-08-01",
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
    note: "固定合同备注",
    createdByUserId: testIds.ownerUser,
    updatedByUserId: actorUserId,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
  const property = {
    id: rentalTestIds.property,
    organizationId: testIds.organization,
    ledgerId: "44444444-4444-4444-8444-444444444401",
    name: "测试房产",
    type: "other" as const,
    customTypeName: "长租公寓",
    countryCode: "CN",
    province: "广东",
    city: "深圳",
    district: "南山",
    addressLine: "科技园 1 号",
    note: "固定房产备注",
    isActive: true,
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
  const tenant = {
    id: CHANGE_PARTIES_TENANT_ID,
    organizationId: testIds.organization,
    type: "individual" as const,
    name: "变更后租户",
    phone: "13800000009",
    email: "changed@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id" as const,
    documentTypeOtherName: null,
    maskedDocumentNumber: null,
    documentNumberLookupHash: null,
    sensitiveIdentityCiphertext: null,
    sensitiveIdentityKeyVersion: null,
    isActive: true,
    note: null,
    createdByUserId: testIds.ownerUser,
    updatedByUserId: testIds.ownerUser,
    deletedAt: null,
    deletedByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
  const space = {
    id: rentalTestIds.childSpace,
    organizationId: testIds.organization,
    propertyId: rentalTestIds.property,
    parentId: rentalTestIds.parentSpace,
    name: "测试房间",
    code: null,
    type: "room" as const,
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
    updatedAt: new Date(FIXED_RENTAL_NOW),
  };
  const party = {
    tenantId: CHANGE_PARTIES_TENANT_ID,
    tenantType: "individual" as const,
    tenantName: "变更后租户",
    phone: "13800000009",
    email: "changed@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id" as const,
    documentTypeOtherName: null,
    maskedDocumentNumber: null,
    validFrom: newValidFrom,
    validTo: newValidTo,
    isPrimaryPayer: true,
  };
  const persistedParty = {
    ...party,
    identitySnapshotCiphertext: null,
    identitySnapshotKeyVersion: null,
  };
  const oldParty = {
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
    validFrom: "2026-08-01",
    validTo: "2026-12-31",
    isPrimaryPayer: true,
  };
  const persistedOldParty = {
    ...oldParty,
    validTo: oldValidTo,
    identitySnapshotCiphertext: null,
    identitySnapshotKeyVersion: null,
  };
  const detail: RentalContractDetailRecord = {
    id: contract.id,
    propertyId: contract.propertyId,
    contractNumber: contract.contractNumber,
    externalContractNumber: contract.externalContractNumber,
    startDate: contract.startDate,
    endDate: contract.endDate,
    rentAmountMinor: contract.rentAmountMinor,
    updatedAt: contract.updatedAt,
    createdAt: contract.createdAt,
    billingAnchor: contract.billingAnchor,
    paymentIntervalMonths: contract.paymentIntervalMonths,
    dueDaysBefore: contract.dueDaysBefore,
    renewedFromContractId: contract.renewedFromContractId,
    cancellationReason: contract.cancellationReason,
    propertyName: "测试房产",
    lifecycleStatus: status,
    displayStatus: "active",
    actualEndDate: "2026-12-31",
    note: "固定合同备注",
    tenantNames: ["变更后租户"],
    spaceNames: ["测试房间"],
    hasScheduledTermination: false,
    terminationDate: null,
    terminationReason: null,
    spaces: [
      {
        spaceId: rentalTestIds.childSpace,
        spaceName: "测试房间",
        spaceCode: null,
        spacePath: [
          { id: rentalTestIds.parentSpace, name: "测试楼栋" },
          { id: rentalTestIds.childSpace, name: "测试房间" },
        ],
        rentAllocationMinor: null,
      },
    ],
    parties: [party],
    depositTerms: [],
  };
  const beforeDetail: RentalContractDetailRecord = {
    ...detail,
    tenantNames: ["测试租户"],
    parties: [oldParty],
  };
  const beforePartyRefs = [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }];
  const partyInput = [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }];
  const changeInput = {
    organizationId: testIds.organization,
    contractId: CHANGE_PARTIES_CONTRACT_ID,
    type: "parties_changed" as const,
    effectiveDate,
    reason: CHANGE_PARTIES_REASON,
    beforePartyRefs,
    afterPartyRefs: partyInput,
    createdByUserId: actorUserId,
  };
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, CHANGE_PARTIES_CONTRACT_ID],
    contract,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, CHANGE_PARTIES_CONTRACT_ID],
    contract,
  );
  setup.state.rentalQuery.registerReadSequence(
    "contracts.detail",
    [testIds.organization, CHANGE_PARTIES_CONTRACT_ID, "2026-08-31"],
    [beforeDetail, detail],
  );
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, rentalTestIds.property],
    property,
  );
  setup.state.rentalQuery.registerRead(
    "tenants.findForUpdate",
    [testIds.organization, CHANGE_PARTIES_TENANT_ID],
    tenant,
  );
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, rentalTestIds.property, rentalTestIds.childSpace],
    space,
  );
  setup.state.rentalQuery.registerRead(
    "spaces.ancestors",
    [testIds.organization, rentalTestIds.property, rentalTestIds.childSpace],
    [{ id: rentalTestIds.childSpace, name: "测试房间" }],
  );
  setup.state.rentalMutation.registerMutation(
    "relations.replacePartyPeriods",
    {
      organizationId: testIds.organization,
      contractId: CHANGE_PARTIES_CONTRACT_ID,
      effectiveDate,
      parties: partyInput,
    },
    {
      partyPeriods: {
        contractId: CHANGE_PARTIES_CONTRACT_ID,
        rows: keepOldPeriod ? [persistedOldParty, persistedParty] : [persistedParty],
      },
      counterEffects: { nextPartyPeriodId: 1 },
    },
  );
  setup.state.rentalMutation.registerMutation("relations.appendChange", changeInput, {
    changes: {
      contractId: CHANGE_PARTIES_CONTRACT_ID,
      rows: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-000000000501",
          organizationId: testIds.organization,
          contractId: CHANGE_PARTIES_CONTRACT_ID,
          type: "parties_changed",
          effectiveDate,
          reason: CHANGE_PARTIES_REASON,
          beforePartyRefs,
          afterPartyRefs: partyInput,
          createdByUserId: actorUserId,
        },
      ],
    },
    counterEffects: { nextChangeId: 1 },
  });
}

function registerSpaceAncestors(setup: TestAppHarness, spaceId: string, parentId?: string): void {
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, rentalTestIds.property, spaceId],
    setup.state.rental.spaces.get(spaceId) ?? null,
  );
  setup.state.rentalQuery.registerRead(
    "spaces.ancestors",
    [testIds.organization, rentalTestIds.property, spaceId],
    parentId
      ? [
          { id: parentId, name: "测试楼栋" },
          { id: spaceId, name: "测试空间" },
        ]
      : [{ id: spaceId, name: "测试空间" }],
  );
}

function registerConfirmSnapshotsMutation(
  setup: TestAppHarness,
  contractId: string,
  spaceId: string,
  startDate: string,
  endDate: string,
  actorUserId = testIds.ownerUser,
): void {
  const current = setup.state.rental.contracts.get(contractId);
  if (!current) throw new Error("Expected draft contract fixture");
  setup.state.rentalQuery.registerRead(
    "contracts.find",
    [testIds.organization, contractId],
    current,
  );
  setup.state.rentalQuery.registerRead(
    "contracts.findForUpdate",
    [testIds.organization, contractId],
    current,
  );
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
  const lifecycleInput = {
    organizationId: testIds.organization,
    id: contractId,
    status: "confirmed" as const,
    updatedByUserId: actorUserId,
  };
  setup.state.rentalMutation.registerMutation("contracts.setLifecycle", lifecycleInput, {
    contract: {
      id: contractId,
      row: { ...current, ...lifecycleInput, updatedAt: new Date(FIXED_RENTAL_NOW) },
    },
  });
}

const _propertyPayload = {
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

function _expectSafeConflict(response: InjectResponse): void {
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
function _expectEmptyOk(response: InjectResponse): void {
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

function snapshotTransactionState(setup: TestAppHarness) {
  return {
    rental: cloneRentalTestState(setup.state.rental),
    bookkeeping: cloneBookkeepingTestState(setup.state.bookkeeping),
    auditLogs: structuredClone(setup.state.auditLogs),
    rentalAuditEntries: structuredClone(setup.state.rental.auditEntries),
  };
}

function expectTransactionStateUnchanged(
  setup: TestAppHarness,
  snapshot: ReturnType<typeof snapshotTransactionState>,
): void {
  expect(cloneRentalTestState(setup.state.rental)).toEqual(snapshot.rental);
  expect(cloneBookkeepingTestState(setup.state.bookkeeping)).toEqual(snapshot.bookkeeping);
  expect(structuredClone(setup.state.auditLogs)).toEqual(snapshot.auditLogs);
  expect(structuredClone(setup.state.rental.auditEntries)).toEqual(snapshot.rentalAuditEntries);
}

function expectRentalCountersUnchanged(setup: TestAppHarness): void {
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

  async function createHarness(options: TestAppOptions = {}): Promise<TestAppHarness> {
    harness = await createTestApp({ bookkeeping: true, rental: true, ...options });
    registerSpaceAncestors(harness, rentalTestIds.childSpace, rentalTestIds.parentSpace);
    const tenant = harness.state.rental.tenants.get(rentalTestIds.tenant);
    if (tenant) {
      harness.state.rentalQuery.registerRead(
        "tenants.findForUpdate",
        [testIds.organization, rentalTestIds.tenant],
        tenant,
      );
    }
    const contract = harness.state.rental.contracts.get(rentalTestIds.contract) ?? null;
    harness.state.rentalQuery.registerRead(
      "contracts.find",
      [testIds.organization, rentalTestIds.contract],
      contract,
    );
    harness.state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, rentalTestIds.contract],
      contract,
    );
    harness.state.rentalQuery.registerRead(
      "properties.findForUpdate",
      [testIds.organization, rentalTestIds.property],
      harness.state.rental.properties.get(rentalTestIds.property) ?? null,
    );
    return harness;
  }

  it("restores contract relations, snapshots, counters and audit after confirmation audit failure", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    const bookkeepingLedgers = state.bookkeeping.ledgers;
    const bookkeepingAccounts = state.bookkeeping.accounts;
    const bookkeepingCategories = state.bookkeeping.categories;
    const bookkeepingTransactions = state.bookkeeping.transactions;
    const bookkeepingMovements = state.bookkeeping.movements;
    const auditLogs = state.auditLogs;
    const rentalAuditEntries = state.rental.auditEntries;
    const room = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: rentalTestIds.property,
          name: "审计失败房间",
          type: "room",
          isRentable: true,
        },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, room.id);
    registerContractDetail(
      harness as TestAppHarness,
      generatedContractId,
      room.id,
      "2027-01-01",
      "2027-02-01",
    );
    const draft = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload: {
          propertyId: rentalTestIds.property,
          startDate: "2027-01-01",
          endDate: "2027-02-01",
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
    registerConfirmSnapshotsMutation(
      harness as TestAppHarness,
      draft.id,
      room.id,
      "2027-01-01",
      "2027-02-01",
    );
    const before = cloneRentalTestState(state.rental);
    const bookkeepingBefore = cloneBookkeepingTestState(state.bookkeeping);
    const bookkeepingCounters = {
      nextAccountId: state.bookkeeping.nextAccountId,
      nextCategoryId: state.bookkeeping.nextCategoryId,
      nextTransactionId: state.bookkeeping.nextTransactionId,
    };
    const auditBefore = state.auditLogs.map((entry) => ({ ...entry }));
    state.rentalQuery.registerSpaceConflict(
      {
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        spaceIds: [room.id],
        startDate: "2027-01-01",
        endDate: "2027-02-01",
        excludeContractId: draft.id,
      },
      [],
    );
    state.failNextRequiredAuditAppendAfterPersist = true;
    const auditFailure = await app.inject({
      method: "POST",
      url: "/api/rental-contracts/confirm",
      headers,
      payload: { id: draft.id },
    });
    expectApiError(auditFailure, 500, "INTERNAL_ERROR");
    expect(cloneRentalTestState(state.rental)).toEqual(before);
    expect(cloneBookkeepingTestState(state.bookkeeping)).toEqual(bookkeepingBefore);
    expect(state.bookkeeping.ledgers).toBe(bookkeepingLedgers);
    expect(state.bookkeeping.accounts).toBe(bookkeepingAccounts);
    expect(state.bookkeeping.categories).toBe(bookkeepingCategories);
    expect(state.bookkeeping.transactions).toBe(bookkeepingTransactions);
    expect(state.bookkeeping.movements).toBe(bookkeepingMovements);
    expect(state.auditLogs).toEqual(auditBefore);
    expect(state.auditLogs).toBe(auditLogs);
    expect(state.rental.auditEntries).toBe(rentalAuditEntries);
    expect(state.rental.contractCounters).toEqual(before.contractCounters);
    const readsBeforeRetry = state.rentalQuery.readCalls.length;
    const confirmed = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/confirm",
        headers,
        payload: { id: draft.id },
      }),
    );
    expect(confirmed.id).toBe(draft.id);
    expect(state.rentalQuery.readCalls.length).toBeGreaterThan(readsBeforeRetry);
    expect(state.rentalQuery.readCalls.at(-1)?.method).toBe("contracts.detail");
    expect(
      state.rentalMutation.mutationCalls.filter(({ method }) =>
        ["relations.confirmSnapshots", "contracts.setLifecycle"].includes(method),
      ),
    ).toHaveLength(4);
    expect(
      state.rentalQuery.resolveRead("contracts.detail", [
        testIds.organization,
        draft.id,
        "2026-08-31",
      ]),
    ).toMatchObject({ id: draft.id });
    expect(state.rental.contracts.get(draft.id)?.status).toBe("confirmed");
    expect(state.rental.snapshots.has(draft.id)).toBe(true);
    expect(state.rental.auditEntries.filter((entry) => entry.targetId === draft.id)).toHaveLength(
      2,
    );
    expect(state.rental.nextContractSpaceId).toBe(before.nextContractSpaceId);
    expect(state.rental.nextPartyPeriodId).toBe(before.nextPartyPeriodId);
    expect(state.rental.nextDepositId).toBe(before.nextDepositId);
    expect(state.rental.nextChangeId).toBe(before.nextChangeId);
    expect(state.rental.nextActionId).toBe(before.nextActionId);
    expect(state.bookkeeping.nextAccountId).toBe(bookkeepingCounters.nextAccountId);
    expect(state.bookkeeping.nextCategoryId).toBe(bookkeepingCounters.nextCategoryId);
    expect(state.bookkeeping.nextTransactionId).toBe(bookkeepingCounters.nextTransactionId);
  });

  it("retries confirmation after relation repository failure without snapshot or lease residue", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    registerContractDetail(
      harness as TestAppHarness,
      generatedContractId,
      rentalTestIds.childSpace,
      "2027-03-01",
      "2027-04-01",
    );
    const draft = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers,
        payload: {
          propertyId: rentalTestIds.property,
          startDate: "2027-03-01",
          endDate: "2027-04-01",
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
    registerConfirmSnapshotsMutation(
      harness as TestAppHarness,
      draft.id,
      rentalTestIds.childSpace,
      "2027-03-01",
      "2027-04-01",
    );
    const before = cloneRentalTestState(state.rental);
    const bookkeepingBefore = cloneBookkeepingTestState(state.bookkeeping);
    const bookkeepingLedgers = state.bookkeeping.ledgers;
    const bookkeepingAccounts = state.bookkeeping.accounts;
    const bookkeepingCategories = state.bookkeeping.categories;
    const bookkeepingTransactions = state.bookkeeping.transactions;
    const bookkeepingMovements = state.bookkeeping.movements;
    state.rentalQuery.registerSpaceConflict(
      {
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        spaceIds: [rentalTestIds.childSpace],
        startDate: "2027-03-01",
        endDate: "2027-04-01",
        excludeContractId: draft.id,
      },
      [],
    );
    state.rental.failNextRepositoryOperation = "relations.confirmSnapshots";
    const relationFailure = await app.inject({
      method: "POST",
      url: "/api/rental-contracts/confirm",
      headers,
      payload: { id: draft.id },
    });
    expectApiError(relationFailure, 500, "INTERNAL_ERROR");
    expect(cloneRentalTestState(state.rental)).toEqual(before);
    expect(cloneBookkeepingTestState(state.bookkeeping)).toEqual(bookkeepingBefore);
    expect(state.bookkeeping.ledgers).toBe(bookkeepingLedgers);
    expect(state.bookkeeping.accounts).toBe(bookkeepingAccounts);
    expect(state.bookkeeping.categories).toBe(bookkeepingCategories);
    expect(state.bookkeeping.transactions).toBe(bookkeepingTransactions);
    expect(state.bookkeeping.movements).toBe(bookkeepingMovements);
    expect(state.rental.snapshots.has(draft.id)).toBe(false);
    const readsBeforeRetry = state.rentalQuery.readCalls.length;
    const confirmed = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/confirm",
        headers,
        payload: { id: draft.id },
      }),
    );
    expect(confirmed.id).toBe(draft.id);
    expect(state.rentalQuery.readCalls.length).toBeGreaterThan(readsBeforeRetry);
    expect(state.rentalQuery.readCalls.at(-1)?.method).toBe("contracts.detail");
    expect(
      state.rentalMutation.mutationCalls.filter(({ method }) =>
        ["relations.confirmSnapshots", "contracts.setLifecycle"].includes(method),
      ),
    ).toHaveLength(2);
    expect(state.rental.snapshots.get(draft.id)?.contractId).toBe(draft.id);
    expect(state.rental.nextContractSpaceId).toBe(before.nextContractSpaceId);
    expect(state.rental.nextPartyPeriodId).toBe(before.nextPartyPeriodId);
    expect(state.rental.nextDepositId).toBe(before.nextDepositId);
    expect(state.rental.nextChangeId).toBe(before.nextChangeId);
    expect(state.rental.nextActionId).toBe(before.nextActionId);
  });

  it("cancels a confirmed pre-start contract for owner and admin with fixed effects", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    try {
      for (const [phone, actorUserId] of [
        [TEST_PHONES.owner, testIds.ownerUser],
        ["13800000007", adminUserId],
      ] as const) {
        const { app, state } = await createHarness();
        const beforeContract = confirmedPreStartContract();
        state.rental.contracts.set(rentalTestIds.contract, beforeContract);
        registerContractDetail(
          harness as TestAppHarness,
          rentalTestIds.contract,
          rentalTestIds.childSpace,
          "2026-09-15",
          "2026-12-31",
          {
            lifecycleStatus: "cancelled",
            displayStatus: "cancelled",
            cancellationReason: "提前取消",
            spaceName: "测试房间",
            spacePath: [
              { id: rentalTestIds.parentSpace, name: "测试楼栋" },
              { id: rentalTestIds.childSpace, name: "测试房间" },
            ],
          },
          beforeContract,
        );
        registerCancelMutation(harness as TestAppHarness, actorUserId);
        const headers = await authorization(app, phone);
        const auditLogsBeforeRequest = structuredClone(state.auditLogs);
        const bookkeepingBefore = cloneBookkeepingTestState(state.bookkeeping);
        const cancelled = expectOk<RentalContractDetail>(
          await app.inject({
            method: "POST",
            url: "/api/rental-contracts/cancel",
            headers,
            payload: { id: rentalTestIds.contract, reason: "提前取消" },
          }),
        );
        expect(cancelled).toEqual(CANCEL_RESPONSE);
        expect(state.rental.contracts.get(rentalTestIds.contract)).toEqual(
          cancelledPreStartContract(actorUserId),
        );
        expect(state.rental.contractSpaces.get(rentalTestIds.contract)).toEqual([
          CANCEL_RESPONSE.spaces[0],
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
            validFrom: "2026-08-01",
            validTo: "2026-12-31",
            isPrimaryPayer: true,
            identitySnapshotCiphertext: null,
            identitySnapshotKeyVersion: null,
          },
        ]);
        expect(state.rental.deposits.get(rentalTestIds.contract)).toBeUndefined();
        expect(state.rental.snapshots).toEqual(new Map());
        expect(state.rental.changes).toEqual(new Map());
        expect(state.rental.actions).toEqual(new Map());
        expect(state.rental.nextContractSpaceId).toBe(1);
        expect(state.rental.nextPartyPeriodId).toBe(1);
        expect(state.rental.nextDepositId).toBe(1);
        expect(state.rental.nextSnapshotId).toBe(1);
        expect(state.rental.nextChangeId).toBe(1);
        expect(state.rental.nextActionId).toBe(1);
        expect(state.rental.nextPropertyId).toBe(1);
        expect(state.rental.nextSpaceId).toBe(1);
        expect(state.rental.nextLedgerId).toBe(1);
        expect(state.rental.nextTenantId).toBe(1);
        expect(state.rental.nextContractId).toBe(1);
        expect(cloneBookkeepingTestState(state.bookkeeping)).toEqual(bookkeepingBefore);
        expect(state.rental.auditEntries).toEqual([
          { action: "rental_contract.cancelled", targetId: rentalTestIds.contract, metadata: {} },
        ]);
        expect(state.auditLogs).toEqual([
          ...auditLogsBeforeRequest,
          expect.objectContaining({
            action: "rental_contract.cancelled",
            actorUserId,
            targetId: rentalTestIds.contract,
            metadata: {},
          }),
        ]);
        await app.close();
        harness = null;
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("rolls back cancel after lifecycle repository effect and retries with the same fixtures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const { app, state } = await createHarness();
    const beforeContract = confirmedPreStartContract();
    state.rental.contracts.set(rentalTestIds.contract, beforeContract);
    registerContractDetail(
      harness as TestAppHarness,
      rentalTestIds.contract,
      rentalTestIds.childSpace,
      "2026-09-15",
      "2026-12-31",
      {
        lifecycleStatus: "cancelled",
        displayStatus: "cancelled",
        cancellationReason: "提前取消",
        spaceName: "测试房间",
        spacePath: [
          { id: rentalTestIds.parentSpace, name: "测试楼栋" },
          { id: rentalTestIds.childSpace, name: "测试房间" },
        ],
      },
      beforeContract,
    );
    registerCancelMutation(harness as TestAppHarness, testIds.ownerUser);
    const headers = await authorization(app, TEST_PHONES.owner);
    const before = snapshotTransactionState(harness as TestAppHarness);
    const auditLogsBefore = structuredClone(state.auditLogs);
    state.rental.failNextRepositoryOperation = "contracts.setLifecycle";
    state.rental.failNextRepositoryOperationPhase = "after";
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/cancel",
        headers,
        payload: { id: rentalTestIds.contract, reason: "提前取消" },
      }),
      500,
      "INTERNAL_ERROR",
    );
    expectTransactionStateUnchanged(harness as TestAppHarness, before);
    const cancelled = expectOk<RentalContractDetail>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/cancel",
        headers,
        payload: { id: rentalTestIds.contract, reason: "提前取消" },
      }),
    );
    expect(cancelled).toEqual(CANCEL_RESPONSE);
    expect(state.rental.contracts.get(rentalTestIds.contract)).toEqual(
      cancelledPreStartContract(testIds.ownerUser),
    );
    expect(state.rental.contractSpaces.get(rentalTestIds.contract)).toEqual([
      CANCEL_RESPONSE.spaces[0],
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
        validFrom: "2026-08-01",
        validTo: "2026-12-31",
        isPrimaryPayer: true,
        identitySnapshotCiphertext: null,
        identitySnapshotKeyVersion: null,
      },
    ]);
    expect(state.rental.deposits.get(rentalTestIds.contract)).toBeUndefined();
    expect(state.rental.snapshots).toEqual(new Map());
    expect(state.rental.changes).toEqual(new Map());
    expect(state.rental.actions).toEqual(new Map());
    expectRentalCountersUnchanged(harness as TestAppHarness);
    expect(cloneBookkeepingTestState(state.bookkeeping)).toEqual(before.bookkeeping);
    expect(state.auditLogs).toEqual([
      ...auditLogsBefore,
      expect.objectContaining({
        action: "rental_contract.cancelled",
        targetId: rentalTestIds.contract,
        metadata: {},
      }),
    ]);
    expect(state.rental.auditEntries).toEqual([
      { action: "rental_contract.cancelled", targetId: rentalTestIds.contract, metadata: {} },
    ]);
    expect(
      state.rental.auditEntries.filter(
        (entry) =>
          entry.targetId === rentalTestIds.contract && entry.action === "rental_contract.cancelled",
      ),
    ).toHaveLength(1);
    vi.useRealTimers();
  });

  it("rolls back cancel after required audit failure and retries with the same fixtures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const { app, state } = await createHarness();
    const beforeContract = confirmedPreStartContract();
    state.rental.contracts.set(rentalTestIds.contract, beforeContract);
    registerContractDetail(
      harness as TestAppHarness,
      rentalTestIds.contract,
      rentalTestIds.childSpace,
      "2026-09-15",
      "2026-12-31",
      {
        lifecycleStatus: "cancelled",
        displayStatus: "cancelled",
        cancellationReason: "提前取消",
        spaceName: "测试房间",
        spacePath: [
          { id: rentalTestIds.parentSpace, name: "测试楼栋" },
          { id: rentalTestIds.childSpace, name: "测试房间" },
        ],
      },
      beforeContract,
    );
    registerCancelMutation(harness as TestAppHarness, testIds.ownerUser);
    const headers = await authorization(app, TEST_PHONES.owner);
    const before = snapshotTransactionState(harness as TestAppHarness);
    const auditLogsBefore = structuredClone(state.auditLogs);
    state.failNextRequiredAuditAppendAfterPersist = true;
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/cancel",
        headers,
        payload: { id: rentalTestIds.contract, reason: "提前取消" },
      }),
      500,
      "INTERNAL_ERROR",
    );
    expectTransactionStateUnchanged(harness as TestAppHarness, before);
    const cancelled = expectOk<RentalContractDetail>(
      await app.inject({
        method: "POST",
        url: "/api/rental-contracts/cancel",
        headers,
        payload: { id: rentalTestIds.contract, reason: "提前取消" },
      }),
    );
    expect(cancelled).toEqual(CANCEL_RESPONSE);
    expect(state.rental.contracts.get(rentalTestIds.contract)).toEqual(
      cancelledPreStartContract(testIds.ownerUser),
    );
    expect(state.rental.contractSpaces.get(rentalTestIds.contract)).toEqual([
      CANCEL_RESPONSE.spaces[0],
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
        validFrom: "2026-08-01",
        validTo: "2026-12-31",
        isPrimaryPayer: true,
        identitySnapshotCiphertext: null,
        identitySnapshotKeyVersion: null,
      },
    ]);
    expect(state.rental.deposits.get(rentalTestIds.contract)).toBeUndefined();
    expect(state.rental.snapshots).toEqual(new Map());
    expect(state.rental.changes).toEqual(new Map());
    expect(state.rental.actions).toEqual(new Map());
    expectRentalCountersUnchanged(harness as TestAppHarness);
    expect(cloneBookkeepingTestState(state.bookkeeping)).toEqual(before.bookkeeping);
    expect(state.auditLogs).toEqual([
      ...auditLogsBefore,
      expect.objectContaining({
        action: "rental_contract.cancelled",
        targetId: rentalTestIds.contract,
        metadata: {},
      }),
    ]);
    expect(state.rental.auditEntries).toEqual([
      { action: "rental_contract.cancelled", targetId: rentalTestIds.contract, metadata: {} },
    ]);
    expect(
      state.rental.auditEntries.filter(
        (entry) =>
          entry.targetId === rentalTestIds.contract && entry.action === "rental_contract.cancelled",
      ),
    ).toHaveLength(1);
    vi.useRealTimers();
  });

  it("rejects cancel for unauthorized, foreign, deleted, missing, and invalid contracts safely", async () => {
    for (const phone of [TEST_PHONES.manager, TEST_PHONES.viewer]) {
      const currentHarness = await createHarness();
      const { app } = currentHarness;
      const headers = await authorization(app, phone);
      const before = snapshotTransactionState(currentHarness);
      expectApiError(
        await app.inject({
          method: "POST",
          url: "/api/rental-contracts/cancel",
          headers,
          payload: { id: rentalTestIds.contract, reason: "不得取消" },
        }),
        403,
        "FORBIDDEN",
      );
      expectTransactionStateUnchanged(currentHarness, before);
      await app.close();
    }

    for (const id of [rentalTestIds.foreignContract, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99"]) {
      const currentHarness = await createHarness();
      const { app, state } = currentHarness;
      if (id.endsWith("99")) {
        const current = state.rental.contracts.get(rentalTestIds.contract);
        if (!current) throw new Error("Expected confirmed contract fixture");
        state.rental.contracts.set(id, {
          ...current,
          id,
          deletedAt: new Date(FIXED_RENTAL_NOW),
        });
      }
      currentHarness.state.rentalQuery.registerRead(
        "contracts.find",
        [testIds.organization, id],
        null,
      );
      currentHarness.state.rentalQuery.registerRead(
        "contracts.findForUpdate",
        [testIds.organization, id],
        null,
      );
      const headers = await authorization(app, TEST_PHONES.owner);
      const before = snapshotTransactionState(currentHarness);
      expectApiError(
        await app.inject({
          method: "POST",
          url: "/api/rental-contracts/cancel",
          headers,
          payload: { id, reason: "不存在" },
        }),
        404,
        "NOT_FOUND",
      );
      expectTransactionStateUnchanged(currentHarness, before);
      await app.close();
    }

    for (const status of ["draft", "confirmed"] as const) {
      const currentHarness = await createHarness();
      const { app, state } = currentHarness;
      const current = state.rental.contracts.get(rentalTestIds.contract);
      if (!current) throw new Error("Expected confirmed contract fixture");
      state.rental.contracts.set(rentalTestIds.contract, {
        ...current,
        status,
        startDate: status === "confirmed" ? "2026-08-01" : "2026-09-15",
        endDate: "2026-12-31",
      });
      const invalidContract = state.rental.contracts.get(rentalTestIds.contract) ?? null;
      currentHarness.state.rentalQuery.registerRead(
        "contracts.find",
        [testIds.organization, rentalTestIds.contract],
        invalidContract,
      );
      currentHarness.state.rentalQuery.registerRead(
        "contracts.findForUpdate",
        [testIds.organization, rentalTestIds.contract],
        invalidContract,
      );
      const headers = await authorization(app, TEST_PHONES.owner);
      const before = snapshotTransactionState(currentHarness);
      const response = await app.inject({
        method: "POST",
        url: "/api/rental-contracts/cancel",
        headers,
        payload: { id: rentalTestIds.contract, reason: "非法状态" },
      });
      _expectSafeConflict(response);
      expectTransactionStateUnchanged(currentHarness, before);
      await app.close();
    }
  });

  it("returns one safe 404 for an actually missing cancellation contract", async () => {
    const setup = await createHarness();
    const missingId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000405";
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
    const before = snapshotTransactionState(setup);
    expectApiError(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/cancel",
        headers,
        payload: { id: missingId, reason: "不存在" },
      }),
      404,
      "NOT_FOUND",
    );
    expectTransactionStateUnchanged(setup, before);
    await setup.app.close();
  });

  it.each([
    ["owner", TEST_PHONES.owner],
    ["admin", "13800000007"],
  ] as const)("changes parties successfully for %s through the real HTTP chain", async (_role, phone) => {
    const setup = await createHarness();
    const actorUserId = phone === TEST_PHONES.owner ? testIds.ownerUser : adminUserId;
    registerChangePartiesFixture(setup, actorUserId);
    const headers = await authorization(setup.app, phone);
    const before = snapshotTransactionState(setup);
    const response = expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/change-parties",
        headers,
        payload: {
          id: CHANGE_PARTIES_CONTRACT_ID,
          effectiveDate: CHANGE_PARTIES_EFFECTIVE_DATE,
          reason: CHANGE_PARTIES_REASON,
          parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
        },
      }),
    );
    expect(response).toEqual(CHANGE_PARTIES_RESPONSE);
    expectChangePartiesSuccessState(setup, before, actorUserId);
  });

  it.each([
    [
      "contract-start",
      {
        effectiveDate: "2026-08-01",
        newValidFrom: "2026-08-01",
        newValidTo: "2026-12-31",
        keepOldPeriod: false,
      },
      START_CHANGE_PARTIES_RESPONSE,
      [
        {
          tenantId: CHANGE_PARTIES_TENANT_ID,
          tenantType: "individual",
          tenantName: "变更后租户",
          phone: "13800000009",
          email: "changed@example.com",
          primaryContactName: null,
          documentCountryCode: "CN",
          documentType: "national_id",
          documentTypeOtherName: null,
          maskedDocumentNumber: null,
          validFrom: "2026-08-01",
          validTo: "2026-12-31",
          isPrimaryPayer: true,
          identitySnapshotCiphertext: null,
          identitySnapshotKeyVersion: null,
        },
      ],
    ],
    [
      "actual-end",
      {
        effectiveDate: "2026-12-31",
        newValidFrom: "2026-12-31",
        newValidTo: "2026-12-31",
        oldValidTo: "2026-12-30",
        keepOldPeriod: true,
      },
      END_CHANGE_PARTIES_RESPONSE,
      [
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
          validFrom: "2026-08-01",
          validTo: "2026-12-30",
          isPrimaryPayer: true,
          identitySnapshotCiphertext: null,
          identitySnapshotKeyVersion: null,
        },
        {
          tenantId: CHANGE_PARTIES_TENANT_ID,
          tenantType: "individual",
          tenantName: "变更后租户",
          phone: "13800000009",
          email: "changed@example.com",
          primaryContactName: null,
          documentCountryCode: "CN",
          documentType: "national_id",
          documentTypeOtherName: null,
          maskedDocumentNumber: null,
          validFrom: "2026-12-31",
          validTo: "2026-12-31",
          isPrimaryPayer: true,
          identitySnapshotCiphertext: null,
          identitySnapshotKeyVersion: null,
        },
      ],
    ],
  ] as const)("changes parties at the %s boundary with fixed final periods", async (_name, options, expectedResponse, expectedPeriods) => {
    const setup = await createHarness();
    registerChangePartiesFixture(setup, testIds.ownerUser, "confirmed", options);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/change-parties",
        headers,
        payload: {
          id: CHANGE_PARTIES_CONTRACT_ID,
          effectiveDate: options.effectiveDate,
          reason: CHANGE_PARTIES_REASON,
          parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
        },
      }),
    );
    expect(response).toEqual(expectedResponse);
    expect(setup.state.rental.partyPeriods.get(CHANGE_PARTIES_CONTRACT_ID)).toEqual(
      expectedPeriods,
    );
    expect(setup.state.rental.contracts).toEqual(before.rental.contracts);
    expect(setup.state.rental.contractSpaces).toEqual(before.rental.contractSpaces);
    expect(setup.state.rental.deposits).toEqual(before.rental.deposits);
    expect(setup.state.rental.snapshots).toEqual(before.rental.snapshots);
    expect(setup.state.rental.actions).toEqual(before.rental.actions);
    expect(setup.state.rental.contractCounters).toEqual(before.rental.contractCounters);
    expect(setup.state.bookkeeping.ledgers).toEqual(before.bookkeeping.ledgers);
    expect(setup.state.bookkeeping.accounts).toEqual(before.bookkeeping.accounts);
    expect(setup.state.bookkeeping.categories).toEqual(before.bookkeeping.categories);
    expect(setup.state.bookkeeping.transactions).toEqual(before.bookkeeping.transactions);
    expect(setup.state.bookkeeping.movements).toEqual(before.bookkeeping.movements);
    expect(setup.state.bookkeeping.nextAccountId).toBe(1);
    expect(setup.state.bookkeeping.nextCategoryId).toBe(1);
    expect(setup.state.bookkeeping.nextTransactionId).toBe(1);
    expect(setup.state.rental.nextPartyPeriodId).toBe(2);
    expect(setup.state.rental.nextChangeId).toBe(2);
    expect(setup.state.rental.changes.get(CHANGE_PARTIES_CONTRACT_ID)).toEqual([
      {
        id: "cccccccc-cccc-4ccc-8ccc-000000000501",
        organizationId: testIds.organization,
        contractId: CHANGE_PARTIES_CONTRACT_ID,
        type: "parties_changed",
        effectiveDate: options.effectiveDate,
        reason: CHANGE_PARTIES_REASON,
        beforePartyRefs: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
        afterPartyRefs: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
        createdByUserId: testIds.ownerUser,
      },
    ]);
    expect(setup.state.rental.auditEntries).toEqual([
      {
        action: "rental_contract.parties_changed",
        targetId: CHANGE_PARTIES_CONTRACT_ID,
        metadata: {
          parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
        },
      },
    ]);
    expect(setup.state.auditLogs).toHaveLength(before.auditLogs.length + 1);
    expect(setup.state.auditLogs.at(-1)).toMatchObject({
      organizationId: testIds.organization,
      actorUserId: testIds.ownerUser,
      action: "rental_contract.parties_changed",
      targetId: CHANGE_PARTIES_CONTRACT_ID,
      targetType: "rental_contract",
      result: "succeeded",
      metadata: {
        parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
      },
    });
    expect(setup.state.auditLogs.at(-1)?.metadata).toEqual({
      parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
    });
    expect(setup.state.rental.contractCounters).toEqual(new Map());
    expect(setup.state.rental.nextPropertyId).toBe(1);
    expect(setup.state.rental.nextSpaceId).toBe(1);
    expect(setup.state.rental.nextLedgerId).toBe(1);
    expect(setup.state.rental.nextTenantId).toBe(1);
    expect(setup.state.rental.nextContractId).toBe(1);
    expect(setup.state.rental.nextContractSpaceId).toBe(1);
    expect(setup.state.rental.nextDepositId).toBe(1);
    expect(setup.state.rental.nextSnapshotId).toBe(1);
    expect(setup.state.rental.nextActionId).toBe(1);
  });

  it.each([
    ["member", TEST_PHONES.manager, { managerPermissions: ["rental_contracts:read"] }],
    ["viewer", TEST_PHONES.viewer, {}],
  ] as const)("rejects change-parties for read-only role %s before service mutation", async (_role, phone, options) => {
    const setup = await createHarness(options);
    const headers = await authorization(setup.app, phone);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/change-parties",
      headers,
      payload: {
        id: CHANGE_PARTIES_CONTRACT_ID,
        effectiveDate: CHANGE_PARTIES_EFFECTIVE_DATE,
        reason: CHANGE_PARTIES_REASON,
        parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
      },
    });
    expectApiError(response, 403, "FORBIDDEN");
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    "foreign",
    "deleted",
    "missing",
  ] as const)("returns a scoped 404 for %s change-parties contract", async (kind) => {
    const setup = await createHarness();
    const id = `bbbbbbbb-bbbb-4bbb-8bbb-0000000005${kind === "foreign" ? "11" : kind === "deleted" ? "12" : "13"}`;
    setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], null);
    setup.state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, id],
      null,
    );
    setup.state.rentalQuery.registerRead(
      "contracts.detail",
      [testIds.organization, id, "2026-08-31"],
      null,
    );
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/change-parties",
      headers,
      payload: {
        id,
        effectiveDate: CHANGE_PARTIES_EFFECTIVE_DATE,
        reason: CHANGE_PARTIES_REASON,
        parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
      },
    });
    expectApiError(response, 404, "NOT_FOUND");
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    ["before-contract-start", "2026-07-31", 409, "CONFLICT"],
    ["after-contract-end", "2027-01-01", 409, "CONFLICT"],
    ["no-primary-payer", CHANGE_PARTIES_EFFECTIVE_DATE, 400, "VALIDATION_FAILED"],
    ["duplicate-tenant", CHANGE_PARTIES_EFFECTIVE_DATE, 400, "VALIDATION_FAILED"],
    ["two-primary-payers", CHANGE_PARTIES_EFFECTIVE_DATE, 400, "VALIDATION_FAILED"],
  ] as const)("rejects %s with the public validation contract", async (kind, effectiveDate, statusCode, code) => {
    const setup = await createHarness();
    registerChangePartiesFixture(setup, testIds.ownerUser);
    const parties =
      kind === "no-primary-payer"
        ? [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: false }]
        : kind === "duplicate-tenant"
          ? [
              { tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true },
              { tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: false },
            ]
          : kind === "two-primary-payers"
            ? [
                { tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true },
                { tenantId: rentalTestIds.tenant, isPrimaryPayer: true },
              ]
            : [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }];
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/change-parties",
      headers,
      payload: {
        id: CHANGE_PARTIES_CONTRACT_ID,
        effectiveDate,
        reason: CHANGE_PARTIES_REASON,
        parties,
      },
    });
    expectApiError(response, statusCode, code);
    if (statusCode === 409) _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
  });

  it("rejects change-parties for a draft contract with a safe lifecycle conflict", async () => {
    const setup = await createHarness();
    registerChangePartiesFixture(setup, testIds.ownerUser, "draft");
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/change-parties",
      headers,
      payload: {
        id: CHANGE_PARTIES_CONTRACT_ID,
        effectiveDate: CHANGE_PARTIES_EFFECTIVE_DATE,
        reason: CHANGE_PARTIES_REASON,
        parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
      },
    });
    _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    ["relations.replacePartyPeriods", "after"],
    ["relations.appendChange", "after"],
  ] as const)("rolls back %s %s failure and retries with unchanged fixtures", async (operation, phase) => {
    const setup = await createHarness();
    registerChangePartiesFixture(setup, testIds.ownerUser);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    setup.state.rental.failNextRepositoryOperation = operation;
    setup.state.rental.failNextRepositoryOperationPhase = phase;
    const request = {
      method: "POST" as const,
      url: "/api/rental-contracts/change-parties",
      headers,
      payload: {
        id: CHANGE_PARTIES_CONTRACT_ID,
        effectiveDate: CHANGE_PARTIES_EFFECTIVE_DATE,
        reason: CHANGE_PARTIES_REASON,
        parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
      },
    };
    expectApiError(await setup.app.inject(request), 500, "INTERNAL_ERROR");
    expectTransactionStateUnchanged(setup, before);
    expect(setup.state.rental.nextPartyPeriodId).toBe(1);
    expect(setup.state.rental.nextChangeId).toBe(1);
    expect(setup.state.rentalMutation.mutationCalls).toHaveLength(
      operation.endsWith("Periods") ? 1 : 2,
    );
    setup.state.rentalQuery.resetReadSequence("contracts.detail", [
      testIds.organization,
      CHANGE_PARTIES_CONTRACT_ID,
      "2026-08-31",
    ]);
    const response = expectOk<RentalContractDetail>(await setup.app.inject(request));
    expect(response).toEqual(CHANGE_PARTIES_RESPONSE);
    expectChangePartiesSuccessState(setup, before, testIds.ownerUser);
  });

  it("rolls back a required audit post-persist failure and retries change-parties", async () => {
    const setup = await createHarness();
    registerChangePartiesFixture(setup, testIds.ownerUser);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    setup.state.failNextRequiredAuditAppendAfterPersist = true;
    const request = {
      method: "POST" as const,
      url: "/api/rental-contracts/change-parties",
      headers,
      payload: {
        id: CHANGE_PARTIES_CONTRACT_ID,
        effectiveDate: CHANGE_PARTIES_EFFECTIVE_DATE,
        reason: CHANGE_PARTIES_REASON,
        parties: [{ tenantId: CHANGE_PARTIES_TENANT_ID, isPrimaryPayer: true }],
      },
    };
    expectApiError(await setup.app.inject(request), 500, "INTERNAL_ERROR");
    expectTransactionStateUnchanged(setup, before);
    expect(setup.state.rental.nextPartyPeriodId).toBe(1);
    expect(setup.state.rental.nextChangeId).toBe(1);
    expect(setup.state.auditLogs).toHaveLength(before.auditLogs.length);
    expect(setup.state.rentalMutation.mutationCalls).toHaveLength(2);

    setup.state.rentalQuery.resetReadSequence("contracts.detail", [
      testIds.organization,
      CHANGE_PARTIES_CONTRACT_ID,
      "2026-08-31",
    ]);
    const response = expectOk<RentalContractDetail>(await setup.app.inject(request));
    expect(response).toEqual(CHANGE_PARTIES_RESPONSE);
    expectChangePartiesSuccessState(setup, before, testIds.ownerUser);
  });

  it.each([
    ["past", "2026-08-15", "terminated"],
    ["today", "2026-08-31", "expiring_soon"],
    ["future", "2026-09-15", "expiring_soon"],
  ] as const)("terminates a confirmed contract on the %s date", async (_name, terminationDate, displayStatus) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerTerminationFixtures(setup, terminationDate);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/terminate",
        headers,
        payload: {
          id: rentalTestIds.contract,
          terminationDate,
          reason: TERMINATION_REASON,
        },
      }),
    );
    expect(response).toEqual(terminationResponse(terminationDate, displayStatus));
    expectTerminationSuccessState(setup, before, terminationDate, testIds.ownerUser);
    vi.useRealTimers();
  });

  it("terminates through the admin write path with the same fixed oracle", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerTerminationFixtures(setup, "2026-09-15", adminUserId);
    const headers = await authorization(setup.app, "13800000007");
    const before = snapshotTransactionState(setup);
    const response = expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/terminate",
        headers,
        payload: {
          id: rentalTestIds.contract,
          terminationDate: "2026-09-15",
          reason: TERMINATION_REASON,
        },
      }),
    );
    expect(response).toEqual(terminationResponse("2026-09-15", "expiring_soon"));
    expectTerminationSuccessState(setup, before, "2026-09-15", adminUserId);
    vi.useRealTimers();
  });

  it.each([
    ["member", TEST_PHONES.manager, { managerPermissions: ["rental_contracts:read"] }],
    ["viewer", TEST_PHONES.viewer, {}],
  ] as const)("rejects terminate for read-only role %s before mutation", async (_role, phone, options) => {
    const setup = await createHarness(options);
    const headers = await authorization(setup.app, phone);
    const before = snapshotTransactionState(setup);
    expectApiError(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/terminate",
        headers,
        payload: {
          id: rentalTestIds.contract,
          terminationDate: "2026-09-15",
          reason: TERMINATION_REASON,
        },
      }),
      403,
      "FORBIDDEN",
    );
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    ["before-start", "2026-07-31"],
    ["at-end", "2026-12-31"],
    ["after-end", "2027-01-01"],
  ] as const)("rejects terminate %s with a safe conflict", async (_name, terminationDate) => {
    const setup = await createHarness();
    registerTerminationFixtures(setup, "2026-09-15");
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/terminate",
      headers,
      payload: { id: rentalTestIds.contract, terminationDate, reason: TERMINATION_REASON },
    });
    _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    ["draft", "draft"],
    ["already terminated", "terminated"],
    ["repeat terminate", "terminated"],
  ] as const)("rejects terminate for an independent %s fixture", async (_name, status) => {
    const setup = await createHarness();
    registerInvalidTerminationFixture(setup, status);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/terminate",
      headers,
      payload: {
        id: rentalTestIds.contract,
        terminationDate: "2026-09-15",
        reason: TERMINATION_REASON,
      },
    });
    _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
    expect(setup.state.rental.auditEntries).toEqual(before.rental.auditEntries);
    expect(setup.state.auditLogs).toEqual(before.auditLogs);
  });

  it.each([
    "foreign",
    "deleted",
    "missing",
  ] as const)("returns a scoped 404 for %s terminate contract", async (kind) => {
    const setup = await createHarness();
    const id = `bbbbbbbb-bbbb-4bbb-8bbb-00000000070${kind === "foreign" ? "1" : kind === "deleted" ? "2" : "3"}`;
    setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], null);
    setup.state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, id],
      null,
    );
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    expectApiError(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/terminate",
        headers,
        payload: { id, terminationDate: "2026-09-15", reason: TERMINATION_REASON },
      }),
      404,
      "NOT_FOUND",
    );
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    ["relations.clipPartyPeriodsToActualEnd", "after"],
    ["contracts.setLifecycle", "after"],
  ] as const)("rolls back terminate %s failure and retries", async (operation, phase) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerTerminationFixtures(setup, "2026-09-15");
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    setup.state.rental.failNextRepositoryOperation = operation;
    setup.state.rental.failNextRepositoryOperationPhase = phase;
    const request = {
      method: "POST" as const,
      url: "/api/rental-contracts/terminate",
      headers,
      payload: {
        id: rentalTestIds.contract,
        terminationDate: "2026-09-15",
        reason: TERMINATION_REASON,
      },
    };
    expectApiError(await setup.app.inject(request), 500, "INTERNAL_ERROR");
    expectTransactionStateUnchanged(setup, before);
    setup.state.rentalQuery.resetReadSequence("contracts.detail", [
      testIds.organization,
      rentalTestIds.contract,
      "2026-08-31",
    ]);
    const response = expectOk<RentalContractDetail>(await setup.app.inject(request));
    expect(response).toEqual(terminationResponse("2026-09-15", "expiring_soon"));
    expectTerminationSuccessState(setup, before, "2026-09-15", testIds.ownerUser);
    vi.useRealTimers();
  });

  it("rolls back terminate audit failure and retries with the same fixtures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerTerminationFixtures(setup, "2026-09-15");
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    setup.state.failNextRequiredAuditAppendAfterPersist = true;
    const request = {
      method: "POST" as const,
      url: "/api/rental-contracts/terminate",
      headers,
      payload: {
        id: rentalTestIds.contract,
        terminationDate: "2026-09-15",
        reason: TERMINATION_REASON,
      },
    };
    expectApiError(await setup.app.inject(request), 500, "INTERNAL_ERROR");
    expectTransactionStateUnchanged(setup, before);
    setup.state.rentalQuery.resetReadSequence("contracts.detail", [
      testIds.organization,
      rentalTestIds.contract,
      "2026-08-31",
    ]);
    const response = expectOk<RentalContractDetail>(await setup.app.inject(request));
    expect(response).toEqual(terminationResponse("2026-09-15", "expiring_soon"));
    expectTerminationSuccessState(setup, before, "2026-09-15", testIds.ownerUser);
    vi.useRealTimers();
  });

  it.each([
    ["owner", TEST_PHONES.owner],
    ["admin", "13800000007"],
  ] as const)("revokes a future termination successfully for %s", async (_role, phone) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    const actorUserId = phone === TEST_PHONES.owner ? testIds.ownerUser : adminUserId;
    registerRevokeFixtures(setup, actorUserId);
    const headers = await authorization(setup.app, phone);
    const before = snapshotTransactionState(setup);
    const response = expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/revoke-termination",
        headers,
        payload: { id: rentalTestIds.contract, reason: REVOCATION_REASON },
      }),
    );
    expect(response).toEqual(restoredContractResponse());
    expectRevokeSuccessState(setup, before, actorUserId);
    vi.useRealTimers();
  });

  it.each([
    ["member", TEST_PHONES.manager, { managerPermissions: ["rental_contracts:read"] }],
    ["viewer", TEST_PHONES.viewer, {}],
  ] as const)("rejects revoke for read-only role %s before mutation", async (_role, phone, options) => {
    const setup = await createHarness(options);
    const headers = await authorization(setup.app, phone);
    const before = snapshotTransactionState(setup);
    expectApiError(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/revoke-termination",
        headers,
        payload: { id: rentalTestIds.contract, reason: REVOCATION_REASON },
      }),
      403,
      "FORBIDDEN",
    );
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    "2026-08-15",
    "2026-08-31",
  ] as const)("rejects revoke for non-future termination %s", async (terminationDate) => {
    const setup = await createHarness();
    registerRevokeFixtures(setup);
    const contract = setup.state.rental.contracts.get(rentalTestIds.contract);
    if (!contract) throw new Error("Expected revoked contract fixture");
    const terminated = { ...contract, terminationDate };
    setup.state.rental.contracts.set(rentalTestIds.contract, terminated);
    setup.state.rentalQuery.registerRead(
      "contracts.find",
      [testIds.organization, rentalTestIds.contract],
      terminated,
    );
    setup.state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, rentalTestIds.contract],
      terminated,
    );
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/revoke-termination",
      headers,
      payload: { id: rentalTestIds.contract, reason: REVOCATION_REASON },
    });
    _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    ["successor", rentalTestIds.childSpace, "601"],
    ["ancestor", rentalTestIds.parentSpace, "602"],
    ["descendant", rentalTestIds.childSpace, "603"],
  ] as const)("rejects revoke when %s overlaps the restored interval", async (kind, conflictSpaceId, conflictSuffix) => {
    const setup = await createHarness();
    registerRevokeFixtures(setup, testIds.ownerUser, kind);
    setup.state.rentalQuery.registerSpaceConflict(
      {
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        spaceIds: [kind === "descendant" ? rentalTestIds.parentSpace : rentalTestIds.childSpace],
        startDate: "2026-09-16",
        endDate: "2026-12-31",
        excludeContractId: rentalTestIds.contract,
      },
      [
        {
          contractId: `bbbbbbbb-bbbb-4bbb-8bbb-000000000${conflictSuffix}`,
          contractNumber: `RC-2026-000${conflictSuffix}`,
          spaceId: conflictSpaceId,
        },
      ],
    );
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/revoke-termination",
      headers,
      payload: { id: rentalTestIds.contract, reason: REVOCATION_REASON },
    });
    _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
  });

  it("allows an adjacent successor without a restored-interval conflict", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerRevokeFixtures(setup, testIds.ownerUser, "successor");
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/revoke-termination",
        headers,
        payload: { id: rentalTestIds.contract, reason: REVOCATION_REASON },
      }),
    );
    expect(response).toEqual(restoredContractResponse());
    expectRevokeSuccessState(setup, before, testIds.ownerUser);
    vi.useRealTimers();
  });

  it.each([
    ["relations.restoreTerminalPartyPeriods", "after"],
    ["contracts.setLifecycle", "after"],
    ["relations.appendTerminationRevocation", "after"],
  ] as const)("rolls back revoke %s failure and retries", async (operation, phase) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerRevokeFixtures(setup);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    setup.state.rental.failNextRepositoryOperation = operation;
    setup.state.rental.failNextRepositoryOperationPhase = phase;
    const request = {
      method: "POST" as const,
      url: "/api/rental-contracts/revoke-termination",
      headers,
      payload: { id: rentalTestIds.contract, reason: REVOCATION_REASON },
    };
    expectApiError(await setup.app.inject(request), 500, "INTERNAL_ERROR");
    expectTransactionStateUnchanged(setup, before);
    setup.state.rentalQuery.resetReadSequence("contracts.detail", [
      testIds.organization,
      rentalTestIds.contract,
      "2026-08-31",
    ]);
    const response = expectOk<RentalContractDetail>(await setup.app.inject(request));
    expect(response).toEqual(restoredContractResponse());
    expectRevokeSuccessState(setup, before, testIds.ownerUser);
    vi.useRealTimers();
  });

  it.each([
    "foreign",
    "deleted",
    "missing",
  ] as const)("returns a scoped 404 for %s revoke contract", async (kind) => {
    const setup = await createHarness();
    const id = `bbbbbbbb-bbbb-4bbb-8bbb-00000000080${kind === "foreign" ? "1" : kind === "deleted" ? "2" : "3"}`;
    setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], null);
    setup.state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, id],
      null,
    );
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    expectApiError(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/revoke-termination",
        headers,
        payload: { id, reason: REVOCATION_REASON },
      }),
      404,
      "NOT_FOUND",
    );
    expectTransactionStateUnchanged(setup, before);
  });

  it("rolls back revoke audit failure and retries with the same fixtures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerRevokeFixtures(setup);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    setup.state.failNextRequiredAuditAppendAfterPersist = true;
    const request = {
      method: "POST" as const,
      url: "/api/rental-contracts/revoke-termination",
      headers,
      payload: { id: rentalTestIds.contract, reason: REVOCATION_REASON },
    };
    expectApiError(await setup.app.inject(request), 500, "INTERNAL_ERROR");
    expectTransactionStateUnchanged(setup, before);
    setup.state.rentalQuery.resetReadSequence("contracts.detail", [
      testIds.organization,
      rentalTestIds.contract,
      "2026-08-31",
    ]);
    const response = expectOk<RentalContractDetail>(await setup.app.inject(request));
    expect(response).toEqual(restoredContractResponse());
    expectRevokeSuccessState(setup, before, testIds.ownerUser);
    vi.useRealTimers();
  });

  it.each([
    ["confirmed", testIds.ownerUser, TEST_PHONES.owner],
    ["terminated", testIds.ownerUser, TEST_PHONES.owner],
    ["confirmed-admin", adminUserId, "13800000007"],
  ] as const)("renews a %s source into a fixed draft", async (sourceLabel, actorUserId, phone) => {
    const source = sourceLabel === "terminated" ? "terminated" : "confirmed";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerRenewFixtures(setup, source, actorUserId);
    const headers = await authorization(setup.app, phone);
    const before = snapshotTransactionState(setup);
    const response = expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/renew",
        headers,
        payload: { id: rentalTestIds.contract },
      }),
    );
    expect(response).toEqual(renewalResponse(source));
    expectRenewalSuccessState(setup, before, source, actorUserId);
    vi.useRealTimers();
  });

  it.each([
    ["active master with changed PII", "active", true],
    ["inactive master", "inactive", false],
    ["deleted master", "deleted", false],
    ["missing master", "missing", false],
  ] as const)("renews from terminal history without depending on the %s", async (_label, masterState, keepFixture) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    if (keepFixture) {
      const current = setup.state.rental.tenants.get(rentalTestIds.tenant);
      if (!current) throw new Error("Expected current tenant fixture");
      setup.state.rentalQuery.registerRead(
        "tenants.findForUpdate",
        [testIds.organization, rentalTestIds.tenant],
        {
          ...current,
          name: "当前主数据新姓名",
          phone: "13900000002",
          email: "current@example.com",
        },
      );
    } else {
      setup.state.rentalQuery.removeRead("tenants.findForUpdate", [
        testIds.organization,
        rentalTestIds.tenant,
      ]);
      const current = setup.state.rental.tenants.get(rentalTestIds.tenant);
      if (!current) throw new Error("Expected current tenant state");
      setup.state.rental.tenants.set(rentalTestIds.tenant, {
        ...current,
        isActive: masterState === "inactive",
        deletedAt: masterState === "deleted" ? new Date(FIXED_RENTAL_NOW) : null,
      });
    }
    registerRenewFixtures(setup, "confirmed");
    setup.state.rentalQuery.removeRead("tenants.findForUpdate", [
      testIds.organization,
      rentalTestIds.tenant,
    ]);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const response = expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/renew",
        headers,
        payload: { id: rentalTestIds.contract },
      }),
    );
    expect(response.parties[0]).toEqual({
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
      validFrom: "2027-01-01",
      validTo: "2027-12-31",
      isPrimaryPayer: true,
    });
    expect(
      setup.state.rentalQuery.readCalls.filter(({ method }) => method === "tenants.findForUpdate"),
    ).toEqual([]);
    expect(setup.state.rental.partyPeriods.get(RENEWAL_CONTRACT_ID)).toEqual([
      renewalPartyPeriod("confirmed"),
    ]);
    vi.useRealTimers();
  });

  it("rejects renewal when terminal party history is missing before numbering", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerRenewFixtures(setup, "confirmed");
    const sourceWithoutHistory = { ...renewalSourceDetail("confirmed"), parties: [] };
    setup.state.rentalQuery.registerRead(
      "contracts.detail",
      [testIds.organization, rentalTestIds.contract, "2026-08-31"],
      sourceWithoutHistory,
    );
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/renew",
      headers,
      payload: { id: rentalTestIds.contract },
    });
    _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
    expect(setup.state.rentalMutation.mutationCalls).toEqual([]);
    expect(setup.state.rentalQuery.readCalls).not.toContainEqual(
      expect.objectContaining({ method: "tenants.findForUpdate" }),
    );
    vi.useRealTimers();
  });

  it.each([
    ["active current tenant", "active", 200],
    ["inactive current tenant", "inactive", 409],
    ["deleted current tenant", "deleted", 404],
    ["missing current tenant", "missing", 404],
    ["foreign current tenant", "foreign", 404],
  ] as const)("applies current tenant admission only when confirming a renewed draft: %s", async (_label, masterState, expectedStatus) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_RENTAL_NOW);
    const setup = await createHarness();
    registerRenewFixtures(setup, "confirmed");
    setup.state.rentalQuery.removeRead("tenants.findForUpdate", [
      testIds.organization,
      rentalTestIds.tenant,
    ]);
    const renewHeaders = await authorization(setup.app, TEST_PHONES.owner);
    expectOk<RentalContractDetail>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/renew",
        headers: renewHeaders,
        payload: { id: rentalTestIds.contract },
      }),
    );
    const current = setup.state.rental.tenants.get(rentalTestIds.tenant);
    if (!current) throw new Error("Expected current tenant state");
    const currentTenant =
      masterState === "active"
        ? {
            ...current,
            name: "确认前主数据姓名",
            phone: "13900000002",
            email: "confirm-current@example.com",
          }
        : masterState === "inactive"
          ? { ...current, isActive: false }
          : null;
    registerRenewConfirmFixtures(setup, currentTenant);
    const beforeConfirm = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/confirm",
      headers: renewHeaders,
      payload: { id: RENEWAL_CONTRACT_ID },
    });
    expect(response.statusCode).toBe(expectedStatus);
    if (expectedStatus === 200) {
      const confirmed = expectOk<RentalContractDetail>(response);
      expect(confirmed).toEqual(renewedConfirmedResponse());
      expect(setup.state.rental.partyPeriods.get(RENEWAL_CONTRACT_ID)).toEqual([
        renewalPartyPeriod("confirmed"),
      ]);
      expect(setup.state.rental.snapshots.get(RENEWAL_CONTRACT_ID)).toEqual({
        contractId: RENEWAL_CONTRACT_ID,
        spaces: renewedConfirmedResponse().spaces,
        parties: [renewalPartyPeriod("confirmed")],
        deposits: [{ ...RENEWAL_DEPOSIT, finalAmountMinor: 50000 }],
      });
      expect(setup.state.rental.deposits.get(RENEWAL_CONTRACT_ID)).toEqual([
        { ...RENEWAL_DEPOSIT, finalAmountMinor: 50000 },
      ]);
      expect(setup.state.bookkeeping).toEqual(beforeConfirm.bookkeeping);
    } else {
      if (expectedStatus === 409) _expectSafeConflict(response);
      else expectApiError(response, 404, "NOT_FOUND");
      expectTransactionStateUnchanged(setup, beforeConfirm);
    }
    expect(setup.state.rentalQuery.readCalls).toContainEqual(
      expect.objectContaining({ method: "tenants.findForUpdate" }),
    );
    vi.useRealTimers();
  });

  it.each([
    ["member", TEST_PHONES.manager, { managerPermissions: ["rental_contracts:read"] }],
    ["viewer", TEST_PHONES.viewer, {}],
  ] as const)("rejects renew for read-only role %s before mutation", async (_role, phone, options) => {
    const setup = await createHarness(options);
    const headers = await authorization(setup.app, phone);
    const before = snapshotTransactionState(setup);
    expectApiError(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/renew",
        headers,
        payload: { id: rentalTestIds.contract },
      }),
      403,
      "FORBIDDEN",
    );
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    "draft",
    "cancelled",
  ] as const)("rejects renew for invalid source status %s", async (status) => {
    const setup = await createHarness();
    registerRenewInvalidSource(setup, status);
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/renew",
      headers,
      payload: { id: rentalTestIds.contract },
    });
    _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
  });

  it("rejects renew when the successor interval conflicts before draft creation", async () => {
    const setup = await createHarness();
    registerRenewFixtures(setup, "confirmed");
    registerRenewConflict(setup, "confirmed");
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    const response = await setup.app.inject({
      method: "POST",
      url: "/api/rental-contracts/renew",
      headers,
      payload: { id: rentalTestIds.contract },
    });
    _expectSafeConflict(response);
    expectTransactionStateUnchanged(setup, before);
    expect(setup.state.rental.contractCounters).toEqual(new Map());
  });

  it.each([
    "foreign",
    "deleted",
    "missing",
  ] as const)("returns a scoped 404 for %s renew source", async (kind) => {
    const setup = await createHarness();
    const id = `bbbbbbbb-bbbb-4bbb-8bbb-0000000009${kind === "foreign" ? "1" : kind === "deleted" ? "2" : "3"}`;
    setup.state.rentalQuery.registerRead("contracts.find", [testIds.organization, id], null);
    setup.state.rentalQuery.registerRead(
      "contracts.findForUpdate",
      [testIds.organization, id],
      null,
    );
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    expectApiError(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/renew",
        headers,
        payload: { id },
      }),
      404,
      "NOT_FOUND",
    );
    expectTransactionStateUnchanged(setup, before);
  });

  it.each([
    ["contracts.nextContractNumber", "after"],
    ["contracts.createDraft", "after"],
    ["relations.replaceDraftSpaces", "after"],
    ["relations.replaceDraftDeposits", "after"],
    ["relations.copyTerminalPartySetToDraft", "after"],
  ] as const)("rolls back renew %s failure and retries with unchanged number/effects", async (operation, phase) => {
    const setup = await createHarness();
    registerRenewFixtures(setup, "confirmed");
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    setup.state.rental.failNextRepositoryOperation = operation;
    setup.state.rental.failNextRepositoryOperationPhase = phase;
    const request = {
      method: "POST" as const,
      url: "/api/rental-contracts/renew",
      headers,
      payload: { id: rentalTestIds.contract },
    };
    expectApiError(await setup.app.inject(request), 500, "INTERNAL_ERROR");
    expectTransactionStateUnchanged(setup, before);
    const response = expectOk<RentalContractDetail>(await setup.app.inject(request));
    expect(response).toEqual(renewalResponse("confirmed"));
    expectRenewalSuccessState(setup, before, "confirmed", testIds.ownerUser);
  });

  it("rolls back a required renew audit post-persist failure and retries", async () => {
    const setup = await createHarness();
    registerRenewFixtures(setup, "terminated");
    const headers = await authorization(setup.app, TEST_PHONES.owner);
    const before = snapshotTransactionState(setup);
    setup.state.failNextRequiredAuditAppendAfterPersist = true;
    const request = {
      method: "POST" as const,
      url: "/api/rental-contracts/renew",
      headers,
      payload: { id: rentalTestIds.contract },
    };
    expectApiError(await setup.app.inject(request), 500, "INTERNAL_ERROR");
    expectTransactionStateUnchanged(setup, before);
    const response = expectOk<RentalContractDetail>(await setup.app.inject(request));
    expect(response).toEqual(renewalResponse("terminated"));
    expectRenewalSuccessState(setup, before, "terminated", testIds.ownerUser);
  });

  async function authorization(app: TestAppHarness["app"], phone: string) {
    const { accessToken } = await login(app, phone);
    return { authorization: `Bearer ${accessToken}` };
  }
});
