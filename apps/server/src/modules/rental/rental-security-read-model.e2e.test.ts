import type {
  RentalPropertyDetail,
  RentalSpaceChildrenPage,
  RentalSpaceSearchPage,
} from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { organizations } from "../../db/schema/identity.js";
import { login, parseJson, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";
import {
  createRentalDatabaseFake,
  createRentalTestState,
  rentalTestIds,
} from "../../test/rental-test-harness.js";
import { FIXED_RENTAL_NOW } from "../../test/rental-test-state.js";
import { buildSpaceConflictStatement } from "./contract-conflicts.queries.js";
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
const generatedTenantId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const generatedContractId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";

function registerPropertyDetail(
  setup: TestAppHarness,
  id: string = generatedPropertyId,
  name: string = propertyPayload.name,
): void {
  setup.state.rentalQuery.registerRead(
    "properties.findForUpdate",
    [testIds.organization, id],
    setup.state.rental.properties.get(id) ?? null,
  );
  setup.state.rentalQuery.registerRead("properties.detail", [testIds.organization, id], {
    id,
    ledgerId: "44444444-4444-4444-8444-000000000101",
    name,
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

function registerTenantDetail(
  setup: TestAppHarness,
  id: string = generatedTenantId,
  name: string = "历史快照租户",
): void {
  const row = {
    id,
    organizationId: testIds.organization,
    type: "individual",
    name,
    phone: "13900000006",
    email: "tenant@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id",
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
    createdAt: new Date(FIXED_RENTAL_NOW),
    updatedAt: new Date(FIXED_RENTAL_NOW),
    contractCount: 0,
  };
  setup.state.rentalQuery.registerRead("tenants.detail", [testIds.organization, id], row);
  setup.state.rentalQuery.registerRead("tenants.findForUpdate", [testIds.organization, id], row);
}

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

function registerContractDetail(
  setup: TestAppHarness,
  id: string = generatedContractId,
  tenantId: string = generatedTenantId,
  startDate = "2027-05-01",
  endDate = "2027-06-01",
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
      lifecycleStatus: "draft",
      displayStatus: "upcoming",
      actualEndDate: endDate,
      tenantNames: ["历史快照租户"],
      spaceNames: ["测试房间"],
      billingAnchor: "contract_start",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      hasScheduledTermination: false,
      renewedFromContractId: null,
      cancellationReason: null,
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
          tenantId,
          tenantType: "individual",
          tenantName: "历史快照租户",
          phone: "13900000006",
          email: "tenant@example.com",
          primaryContactName: null,
          documentCountryCode: "CN",
          documentType: "national_id",
          documentTypeOtherName: null,
          maskedDocumentNumber:
            setup.state.rental.tenants.get(tenantId)?.maskedDocumentNumber ?? null,
          validFrom: startDate,
          validTo: endDate,
          isPrimaryPayer: true,
        },
      ],
      depositTerms: [],
      createdAt: new Date(FIXED_RENTAL_NOW),
    },
  );
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftSpaces",
    {
      organizationId: testIds.organization,
      contractId: id,
      propertyId: rentalTestIds.property,
      spaces: [{ spaceId: rentalTestIds.childSpace }],
    },
    {
      contractSpaces: {
        contractId: id,
        rows: [
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
      },
    },
  );
  setup.state.rentalMutation.registerMutation(
    "relations.replaceDraftParties",
    {
      organizationId: testIds.organization,
      contractId: id,
      parties: [{ tenantId, isPrimaryPayer: true }],
    },
    {
      partyPeriods: {
        contractId: id,
        rows: [
          {
            tenantId,
            tenantType: "individual",
            tenantName: "历史快照租户",
            phone: "13900000006",
            email: "tenant@example.com",
            primaryContactName: null,
            documentCountryCode: "CN",
            documentType: "national_id",
            documentTypeOtherName: null,
            maskedDocumentNumber:
              setup.state.rental.tenants.get(tenantId)?.maskedDocumentNumber ?? null,
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

function registerSpaceAncestors(
  setup: TestAppHarness,
  spaceId: string,
  parentId?: string,
  propertyId: string = rentalTestIds.property,
): void {
  setup.state.rentalQuery.registerRead(
    "spaces.findForUpdate",
    [testIds.organization, propertyId, spaceId],
    setup.state.rental.spaces.get(spaceId) ?? null,
  );
  setup.state.rentalQuery.registerRead(
    "spaces.ancestors",
    [testIds.organization, propertyId, spaceId],
    parentId
      ? [
          { id: parentId, name: "测试楼栋" },
          { id: spaceId, name: "测试空间" },
        ]
      : [{ id: spaceId, name: "测试空间" }],
  );
}

function registerLeaseStates(setup: TestAppHarness, propertyId: string, spaceIds: string[]): void {
  setup.state.rentalQuery.registerRead(
    "spaces.leaseStates",
    [testIds.organization, propertyId, spaceIds, "2026-08-31"],
    new Map(
      spaceIds.map((spaceId) => [
        spaceId,
        {
          spaceId,
          hasOwnActive: false,
          hasOwnExpiringSoon: false,
          hasOwnUpcoming: false,
          hasAncestorCurrentOrUpcoming: false,
          hasDescendantCurrentOrUpcoming: false,
        },
      ]),
    ),
  );
}

function registerConfirmSnapshotsMutation(
  setup: TestAppHarness,
  contractId: string,
  tenantId: string,
  startDate: string,
  endDate: string,
  identitySnapshotCiphertext: Buffer | null,
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
    spaceId: rentalTestIds.childSpace,
    spaceName: "测试房间",
    spaceCode: null,
    spacePath: [
      { id: rentalTestIds.parentSpace, name: "测试楼栋" },
      { id: rentalTestIds.childSpace, name: "测试房间" },
    ],
    rentAllocationMinor: null,
  };
  const party = {
    tenantId,
    tenantType: "individual" as const,
    tenantName: "历史快照租户",
    phone: "13900000006",
    email: "tenant@example.com",
    primaryContactName: null,
    documentCountryCode: "CN",
    documentType: "national_id" as const,
    documentTypeOtherName: null,
    maskedDocumentNumber: setup.state.rental.tenants.get(tenantId)?.maskedDocumentNumber ?? null,
    validFrom: startDate,
    validTo: endDate,
    isPrimaryPayer: true,
    identitySnapshotCiphertext: identitySnapshotCiphertext
      ? Buffer.from(identitySnapshotCiphertext)
      : null,
    identitySnapshotKeyVersion: identitySnapshotCiphertext ? 1 : null,
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
    updatedByUserId: testIds.ownerUser,
  };
  setup.state.rentalMutation.registerMutation("contracts.setLifecycle", lifecycleInput, {
    contract: {
      id: contractId,
      row: { ...current, ...lifecycleInput, updatedAt: new Date(FIXED_RENTAL_NOW) },
    },
  });
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
function expectEmptyOk(response: InjectResponse): void {
  expect(response.statusCode).toBe(200);
  expect(parseJson(response)).toEqual({ code: "OK", message: "ok", data: null });
}

function expectOrdinaryResponseNotToContainSensitiveValues(
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
    "gender",
    "ethnicity",
  ]) {
    expect(serialized).not.toContain(`"${key}"`);
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

  async function createHarness(): Promise<TestAppHarness> {
    harness = await createTestApp({ bookkeeping: true, rental: true });
    registerPropertyDetail(harness);
    registerPropertyDetail(harness, rentalTestIds.property, "测试房产");
    registerPropertyList(harness);
    registerTenantDetail(harness);
    registerSpaceAncestors(harness, rentalTestIds.childSpace, rentalTestIds.parentSpace);
    harness.state.rentalQuery.registerRead(
      "properties.detail",
      [testIds.organization, rentalTestIds.foreignProperty],
      null,
    );
    return harness;
  }

  it("fails closed for unknown rental database select capabilities", async () => {
    const db = createRentalDatabaseFake(createRentalTestState()) as unknown as {
      select(fields: unknown): unknown;
      execute(query: unknown): Promise<unknown>;
    };
    expect(() => db.select({ unknown: "shape" })).toThrow(
      "Rental test database capability unavailable: select",
    );
    const unknownQuery = {
      queryChunks: [
        { value: [rentalTestIds.childSpace] },
        { value: testIds.organization },
        { value: rentalTestIds.property },
        { value: "2026-10-01" },
        { value: "2026-11-01" },
      ],
    };
    await expect(db.execute(unknownQuery)).rejects.toThrow(
      "Rental test database capability unavailable: execute",
    );
    const select = db.select({ timezone: organizations.timezone }) as {
      from(table: unknown): {
        where(query: unknown): { limit(value: unknown): Promise<unknown> };
      };
    };
    await expect(
      select
        .from({ wrongTable: true })
        .where({ queryChunks: [{ value: "=" }, { value: testIds.organization }] })
        .limit(1),
    ).rejects.toThrow("Rental test database capability unavailable: select");
    expect(() => db.select({ timezone: organizations.id })).toThrow(
      "Rental test database capability unavailable: select",
    );
    const malformedSelect = db.select({ timezone: organizations.timezone }) as {
      from(table: unknown): {
        where(query: unknown): { limit(value: unknown): Promise<unknown> };
      };
    };
    await expect(
      malformedSelect
        .from(organizations)
        .where({ queryChunks: [{ value: "=" }, { value: testIds.organization }] })
        .limit(1),
    ).rejects.toThrow("Rental test database capability unavailable: select");
  });

  it("rejects conflict capability tuples outside the scoped query contract", async () => {
    const state = createRentalTestState();
    const db = createRentalDatabaseFake(state) as unknown as {
      execute(query: unknown): Promise<unknown>;
    };
    const input = {
      organizationId: testIds.organization,
      propertyId: rentalTestIds.property,
      spaceIds: [rentalTestIds.childSpace],
      startDate: "2027-01-01",
      endDate: "2027-02-01",
    };
    await expect(
      db.execute(
        buildSpaceConflictStatement({
          ...input,
          organizationId: testIds.otherOrganization,
        }),
      ),
    ).rejects.toThrow("Rental test database capability unavailable: execute");
    await expect(
      db.execute(
        buildSpaceConflictStatement({
          ...input,
          propertyId: rentalTestIds.foreignProperty,
        }),
      ),
    ).rejects.toThrow("Rental test database capability unavailable: execute");
    const deletedSpace = state.spaces.get(rentalTestIds.childSpace);
    expect(deletedSpace).toBeDefined();
    if (!deletedSpace) return;
    deletedSpace.deletedAt = new Date("2026-08-31T00:00:00.000Z");
    await expect(db.execute(buildSpaceConflictStatement(input))).rejects.toThrow(
      "Rental test database capability unavailable: execute",
    );
    deletedSpace.deletedAt = null;

    const extraUuidQuery = buildSpaceConflictStatement(input) as unknown as {
      queryChunks: unknown[];
    };
    extraUuidQuery.queryChunks.push({ value: "cccccccc-cccc-4ccc-8ccc-cccccccccc01" });
    await expect(db.execute(extraUuidQuery)).rejects.toThrow(
      "Rental test database capability unavailable: execute",
    );

    const markerCollisionQuery = buildSpaceConflictStatement(input) as unknown as {
      queryChunks: unknown[];
    };
    const replaceMarker = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return false;
      if ("value" in value) {
        const chunkValue = (value as { value: unknown }).value;
        if (typeof chunkValue === "string" && chunkValue.includes("rental.space-conflict.v1")) {
          (value as { value: string }).value = chunkValue.replace(
            "rental.space-conflict.v1",
            "rental.space-conflict.v1-collision",
          );
          return true;
        }
        if (Array.isArray(chunkValue)) {
          const markerIndex = chunkValue.findIndex(
            (item) => typeof item === "string" && item.includes("rental.space-conflict.v1"),
          );
          if (markerIndex >= 0) {
            chunkValue[markerIndex] = (chunkValue[markerIndex] as string).replace(
              "rental.space-conflict.v1",
              "rental.space-conflict.v1-collision",
            );
            return true;
          }
        }
      }
      if ("queryChunks" in value && Array.isArray(value.queryChunks)) {
        return value.queryChunks.some(replaceMarker);
      }
      return false;
    };
    expect(replaceMarker(markerCollisionQuery)).toBe(true);
    await expect(db.execute(markerCollisionQuery)).rejects.toThrow(
      "Rental test database capability unavailable: execute",
    );
  });

  it("reveals a confirmed contract history through real decrypt and audits without leaking ordinary identity", async () => {
    const setup = await createTestApp({
      bookkeeping: true,
      rental: true,
      managerPermissions: ["rental_contracts:read", "rental_tenants:sensitive_read"],
    });
    harness = setup;
    registerPropertyDetail(setup, rentalTestIds.property, "测试房产");
    registerTenantDetail(setup);
    registerSpaceAncestors(setup, rentalTestIds.childSpace, rentalTestIds.parentSpace);
    const ownerHeaders = await authorization(setup.app, TEST_PHONES.owner);
    registerTenantDocumentConflict(setup, "110101199001011238");
    const tenant = expectOk<{ id: string }>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers: ownerHeaders,
        payload: {
          type: "individual",
          name: "历史快照租户",
          phone: "13900000006",
          documentCountryCode: "CN",
          documentType: "national_id",
          documentNumber: "110101199001011238",
          birthDate: "1990-01-02",
          gender: "male",
          ethnicity: "汉族",
          documentAddress: "历史地址",
        },
      }),
    );
    registerContractDetail(setup, generatedContractId, tenant.id);
    const draft = expectOk<{ id: string }>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/create",
        headers: ownerHeaders,
        payload: {
          propertyId: rentalTestIds.property,
          startDate: "2027-05-01",
          endDate: "2027-06-01",
          parties: [{ tenantId: tenant.id, isPrimaryPayer: true }],
          spaces: [{ spaceId: rentalTestIds.childSpace }],
          depositTerms: [],
        },
      }),
    );
    registerConfirmSnapshotsMutation(
      setup,
      draft.id,
      tenant.id,
      "2027-05-01",
      "2027-06-01",
      setup.state.rental.tenants.get(tenant.id)?.sensitiveIdentityCiphertext ?? null,
    );
    setup.state.rentalQuery.registerSpaceConflict(
      {
        organizationId: testIds.organization,
        propertyId: rentalTestIds.property,
        spaceIds: [rentalTestIds.childSpace],
        startDate: "2027-05-01",
        endDate: "2027-06-01",
        excludeContractId: draft.id,
      },
      [],
    );
    expectOk(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/confirm",
        headers: ownerHeaders,
        payload: { id: draft.id },
      }),
    );
    const managerHeaders = await authorization(setup.app, TEST_PHONES.manager);
    const ordinary = await setup.app.inject({
      method: "GET",
      url: `/api/rental-contracts/detail?id=${draft.id}`,
      headers: managerHeaders,
    });
    const ordinaryData = expectOk<{
      parties: Array<{ maskedDocumentNumber: string | null }>;
    }>(ordinary);
    expect(ordinaryData.parties[0]?.maskedDocumentNumber).toBe("**************1238");
    expectOrdinaryResponseNotToContainSensitiveValues(ordinary, [
      "110101199001011238",
      "历史地址",
      "汉族",
    ]);
    const revealed = expectOk<{
      contractId: string;
      tenantId: string;
      validFrom: string;
      validTo: string;
      documentNumber: string | null;
      birthDate: string | null;
      gender: "male" | null;
      ethnicity: string | null;
      documentAddress: string | null;
    }>(
      await setup.app.inject({
        method: "POST",
        url: "/api/rental-contracts/reveal-sensitive",
        headers: managerHeaders,
        payload: { contractId: draft.id, tenantId: tenant.id, validFrom: "2027-05-01" },
      }),
    );
    expect(revealed).toEqual({
      contractId: draft.id,
      tenantId: tenant.id,
      validFrom: "2027-05-01",
      validTo: "2027-06-01",
      documentNumber: "110101199001011238",
      birthDate: "1990-01-02",
      gender: "male",
      ethnicity: "汉族",
      documentAddress: "历史地址",
    });
    expect(
      setup.state.rental.auditEntries.some((entry) =>
        entry.action.endsWith("party_sensitive_revealed"),
      ),
    ).toBe(true);
    const auditText = JSON.stringify(setup.state.rental.auditEntries);
    expect(auditText).not.toContain("110101199001011238");
    expect(auditText).not.toContain("历史地址");
    for (const key of ["gender", "phone", "email", "note", "reason"]) {
      expect(auditText).not.toContain(`"${key}"`);
    }
    for (const value of ["13900000006", "历史地址", "汉族"]) {
      expect(auditText).not.toContain(value);
    }
  });

  it("returns one not-found response for local contract foreign, deleted, and missing history tenants", async () => {
    const cases = [
      { title: "foreign", tenantId: rentalTestIds.foreignTenant, deleted: false },
      { title: "missing", tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99", deleted: false },
      { title: "deleted", tenantId: rentalTestIds.tenant, deleted: true },
    ] as const;
    for (const testCase of cases) {
      const setup = await createTestApp({
        bookkeeping: true,
        rental: true,
        managerPermissions: ["rental_contracts:read", "rental_tenants:sensitive_read"],
      });
      harness = setup;
      registerPropertyDetail(setup, rentalTestIds.property, "测试房产");
      registerContractDetail(
        setup,
        generatedContractId,
        rentalTestIds.tenant,
        "2027-07-01",
        "2027-08-01",
      );
      const tenant = setup.state.rental.tenants.get(testCase.tenantId);
      setup.state.rentalQuery.registerRead(
        "tenants.findForUpdate",
        [testIds.organization, testCase.tenantId],
        tenant?.organizationId === testIds.organization && tenant.deletedAt === null
          ? tenant
          : null,
      );
      const localTenant = setup.state.rental.tenants.get(rentalTestIds.tenant);
      if (localTenant) {
        setup.state.rentalQuery.registerRead(
          "tenants.findForUpdate",
          [testIds.organization, rentalTestIds.tenant],
          localTenant,
        );
      }
      registerSpaceAncestors(setup, rentalTestIds.childSpace, rentalTestIds.parentSpace);
      const ownerHeaders = await authorization(setup.app, TEST_PHONES.owner);
      const draft = expectOk<{ id: string }>(
        await setup.app.inject({
          method: "POST",
          url: "/api/rental-contracts/create",
          headers: ownerHeaders,
          payload: {
            propertyId: rentalTestIds.property,
            startDate: "2027-07-01",
            endDate: "2027-08-01",
            parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
            spaces: [{ spaceId: rentalTestIds.childSpace }],
            depositTerms: [],
          },
        }),
      );
      registerConfirmSnapshotsMutation(
        setup,
        draft.id,
        rentalTestIds.tenant,
        "2027-07-01",
        "2027-08-01",
        null,
      );
      setup.state.rentalQuery.registerSpaceConflict(
        {
          organizationId: testIds.organization,
          propertyId: rentalTestIds.property,
          spaceIds: [rentalTestIds.childSpace],
          startDate: "2027-07-01",
          endDate: "2027-08-01",
          excludeContractId: draft.id,
        },
        [],
      );
      expectOk(
        await setup.app.inject({
          method: "POST",
          url: "/api/rental-contracts/confirm",
          headers: ownerHeaders,
          payload: { id: draft.id },
        }),
      );
      if (testCase.deleted) {
        const tenant = setup.state.rental.tenants.get(testCase.tenantId);
        if (!tenant) throw new Error(`Missing ${testCase.title} fixture`);
        tenant.deletedAt = new Date("2026-08-31T04:00:00.000Z");
      }
      const period = setup.state.rental.partyPeriods.get(draft.id)?.[0];
      if (!period) throw new Error("Missing local contract history fixture");
      setup.state.rental.partyPeriods.set(draft.id, [{ ...period, tenantId: testCase.tenantId }]);
      const managerHeaders = await authorization(setup.app, TEST_PHONES.manager);
      expectApiError(
        await setup.app.inject({
          method: "POST",
          url: "/api/rental-contracts/reveal-sensitive",
          headers: managerHeaders,
          payload: {
            contractId: draft.id,
            tenantId: testCase.tenantId,
            validFrom: "2027-07-01",
          },
        }),
        404,
        "NOT_FOUND",
      );
      await setup.app.close();
      harness = null;
    }
  });

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

  function spaceNode(input: {
    id: string;
    propertyId: string;
    parentId: string | null;
    name: string;
    type: "building" | "floor" | "unit" | "room";
    isRentable: boolean;
    sortOrder: number;
    isEffectivelyActive?: boolean;
  }) {
    return {
      id: input.id,
      propertyId: input.propertyId,
      parentId: input.parentId,
      name: input.name,
      code: null,
      type: input.type,
      customTypeName: null,
      isRentable: input.isRentable,
      isActive: true,
      isEffectivelyActive: input.isEffectivelyActive ?? true,
      hasChildren: false,
      note: null,
      sortOrder: input.sortOrder,
    };
  }

  function registerChildrenPage(
    setup: TestAppHarness,
    propertyId: string,
    parentId: string | null,
    items: unknown[],
    total = items.length,
  ): void {
    setup.state.rentalQuery.registerRead(
      "spaces.listChildren",
      [testIds.organization, propertyId, { parentId, page: 1, pageSize: 20 }],
      { items, total, page: 1, pageSize: 20 },
    );
    registerLeaseStates(
      setup,
      propertyId,
      (items as Array<{ id: string }>).map((item) => item.id),
    );
  }

  function registerSearchPage(
    setup: TestAppHarness,
    propertyId: string,
    keyword: string,
    page: number,
    items: unknown[],
    total: number,
    pageSize = 20,
  ): void {
    setup.state.rentalQuery.registerRead(
      "spaces.search",
      [testIds.organization, propertyId, { keyword, page, pageSize }],
      { items, total, page, pageSize },
    );
    registerLeaseStates(
      setup,
      propertyId,
      (items as Array<{ id: string }>).map((item) => item.id),
    );
  }

  function registerPropertyList(
    setup: TestAppHarness,
    propertyId: string = generatedPropertyId,
    name: string = propertyPayload.name,
  ): void {
    setup.state.rentalQuery.registerRead(
      "properties.list",
      [testIds.organization, { page: 1, pageSize: 20 }],
      {
        items: [
          {
            id: propertyId,
            ledgerId: "44444444-4444-4444-8444-000000000101",
            name,
            type: propertyPayload.type,
            customTypeName: propertyPayload.customTypeName,
            countryCode: propertyPayload.countryCode,
            province: propertyPayload.province,
            city: propertyPayload.city,
            district: propertyPayload.district,
            addressLine: propertyPayload.addressLine,
            isActive: true,
            spaceCount: 0,
            rentableSpaceCount: 0,
            updatedAt: new Date(FIXED_RENTAL_NOW),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    );
  }

  it("owner creates a property with its rental ledger and manages a four-level space tree", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, "13800000001");
    const property = await createProperty(headers);

    expect(property).toMatchObject({ ...propertyPayload, isActive: true });
    expect(state.bookkeeping.ledgers.get(property.ledgerId)).toMatchObject({
      organizationId: testIds.organization,
      name: propertyPayload.name,
      type: "rental",
      isDefault: false,
    });
    expect(state.rental.properties.get(property.id)?.customTypeName).toBe("长租公寓");

    const root = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          name: "1 号楼",
          code: "B1",
          type: "building",
          isRentable: false,
        },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, root.id, undefined, property.id);
    const level2 = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          parentId: root.id,
          name: "1 层",
          type: "floor",
          isRentable: false,
        },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, level2.id, root.id, property.id);
    const level3 = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          parentId: level2.id,
          name: "A 单元",
          type: "unit",
          isRentable: false,
        },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, level3.id, level2.id, property.id);
    const room = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          parentId: level3.id,
          name: "101",
          code: "101",
          type: "room",
          isRentable: true,
        },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, room.id, level3.id, property.id);
    registerChildrenPage(harness as TestAppHarness, property.id, level3.id, [
      spaceNode({
        id: room.id,
        propertyId: property.id,
        parentId: level3.id,
        name: "101",
        type: "room",
        isRentable: true,
        sortOrder: 0,
      }),
    ]);
    registerSearchPage(
      harness as TestAppHarness,
      property.id,
      "101",
      1,
      [
        {
          ...spaceNode({
            id: room.id,
            propertyId: property.id,
            parentId: level3.id,
            name: "101",
            type: "room",
            isRentable: true,
            sortOrder: 0,
          }),
          path: [
            { id: root.id, name: "1 号楼" },
            { id: level2.id, name: "1 层" },
            { id: level3.id, name: "A 单元" },
            { id: room.id, name: "101" },
          ],
        },
      ],
      1,
    );

    const children = expectOk<RentalSpaceChildrenPage>(
      await app.inject({
        method: "GET",
        url: `/api/rental-spaces/children?propertyId=${property.id}&parentId=${level3.id}`,
        headers,
      }),
    );
    expect(children.items).toEqual([
      expect.objectContaining({ id: room.id, parentId: level3.id, isEffectivelyActive: true }),
    ]);
    const search = expectOk<RentalSpaceSearchPage>(
      await app.inject({
        method: "GET",
        url: `/api/rental-spaces/search?propertyId=${property.id}&keyword=101`,
        headers,
      }),
    );
    expect(search.items).toEqual([
      expect.objectContaining({
        id: room.id,
        path: [
          { id: root.id, name: "1 号楼" },
          { id: level2.id, name: "1 层" },
          { id: level3.id, name: "A 单元" },
          { id: room.id, name: "101" },
        ],
      }),
    ]);

    (harness as TestAppHarness).state.rentalQuery.registerRead(
      "spaces.descendants",
      [testIds.organization, property.id, root.id],
      [level2.id, level3.id, room.id],
    );
    (harness as TestAppHarness).state.rentalQuery.registerRead(
      "contracts.referenceSummary",
      [
        {
          organizationId: testIds.organization,
          propertyId: property.id,
          today: "2026-08-31",
          ownSpaceIds: [root.id],
          descendantSpaceIds: [level2.id, level3.id, room.id],
          oldAncestorSpaceIds: [],
        },
      ],
      { own: false, descendant: false, oldAncestor: false },
    );
    (harness as TestAppHarness).state.rentalQuery.registerRead(
      "spaces.ancestors",
      [testIds.organization, property.id, room.id],
      [
        { id: root.id, name: "1 号楼" },
        { id: level2.id, name: "1 层" },
        { id: level3.id, name: "A 单元" },
        { id: room.id, name: "101" },
      ],
    );

    expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/set-status",
        headers,
        payload: { id: root.id, isActive: false },
      }),
    );
    registerChildrenPage(harness as TestAppHarness, property.id, level3.id, [
      spaceNode({
        id: room.id,
        propertyId: property.id,
        parentId: level3.id,
        name: "101",
        type: "room",
        isRentable: true,
        sortOrder: 0,
        isEffectivelyActive: false,
      }),
    ]);
    const descendantsAfterStop = expectOk<RentalSpaceChildrenPage>(
      await app.inject({
        method: "GET",
        url: `/api/rental-spaces/children?propertyId=${property.id}&parentId=${level3.id}`,
        headers,
      }),
    );
    expect(descendantsAfterStop.items).toEqual([
      expect.objectContaining({ id: room.id, isActive: true, isEffectivelyActive: false }),
    ]);

    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          parentId: room.id,
          name: "超限层级",
          type: "room",
          isRentable: true,
        },
      }),
      400,
      "VALIDATION_FAILED",
    );
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/move",
        headers,
        payload: { id: root.id, parentId: room.id, sortOrder: 1 },
      }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects duplicate batches before writing and restores a batch after audit persistence fails", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, "13800000001");
    const property = await createProperty(headers);
    const auditCount = state.auditLogs.length;

    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/batch-create",
        headers,
        payload: {
          propertyId: property.id,
          type: "room",
          isRentable: true,
          items: [
            { name: "101", code: "A" },
            { name: "101", code: "B" },
          ],
        },
      }),
      409,
      "CONFLICT",
    );
    expect(
      [...state.rental.spaces.values()].filter((space) => space.propertyId === property.id),
    ).toEqual([]);
    expect(state.auditLogs).toHaveLength(auditCount);

    const parent = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          name: "1 号楼",
          type: "building",
          isRentable: false,
        },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, parent.id, undefined, property.id);
    const spaceEntriesBeforeAuditFailure = [...state.rental.spaces.entries()].map(([id, space]) => [
      id,
      { ...space },
    ]);
    const nextSpaceIdBeforeAuditFailure = state.rental.nextSpaceId;
    const auditEntriesBeforeAuditFailure = state.auditLogs.map((audit) => ({ ...audit }));
    state.failNextRequiredAuditAppendAfterPersist = true;
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/batch-create",
        headers,
        payload: {
          propertyId: property.id,
          parentId: parent.id,
          type: "room",
          isRentable: true,
          items: [{ name: "201" }, { name: "202" }],
        },
      }),
      500,
      "INTERNAL_ERROR",
    );
    expect([...state.rental.spaces.entries()]).toEqual(spaceEntriesBeforeAuditFailure);
    expect(state.rental.nextSpaceId).toBe(nextSpaceIdBeforeAuditFailure);
    expect(state.auditLogs).toEqual(auditEntriesBeforeAuditFailure);
    expect(state.failNextRequiredAuditAppendAfterPersist).toBe(false);

    const batch = expectOk<{ ids: string[] }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/batch-create",
        headers,
        payload: {
          propertyId: property.id,
          parentId: parent.id,
          type: "room",
          isRentable: true,
          items: [{ name: "201" }, { name: "202" }],
        },
      }),
    );
    expect(batch.ids).toHaveLength(2);
  });

  it("updates, moves and deletes spaces before soft-deleting the renamed property and rental ledger", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, "13800000001");
    const property = await createProperty(headers);
    registerPropertyDetail(harness as TestAppHarness, property.id, "阳光公寓二期");
    const renamed = expectOk<RentalPropertyDetail>(
      await app.inject({
        method: "POST",
        url: "/api/rental-properties/update",
        headers,
        payload: { id: property.id, name: "阳光公寓二期" },
      }),
    );
    expect(renamed.name).toBe("阳光公寓二期");
    expect(state.bookkeeping.ledgers.get(property.ledgerId)?.name).toBe("阳光公寓二期");

    const left = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          name: "左楼",
          type: "building",
          isRentable: false,
        },
      }),
    );
    const right = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          name: "右楼",
          type: "building",
          isRentable: false,
        },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, left.id, undefined, property.id);
    registerSpaceAncestors(harness as TestAppHarness, right.id, undefined, property.id);
    const child = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          parentId: left.id,
          name: "101",
          type: "room",
          isRentable: true,
        },
      }),
    );
    registerSpaceAncestors(harness as TestAppHarness, child.id, left.id, property.id);
    expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/update",
        headers,
        payload: { id: child.id, name: "101A", code: "A-101" },
      }),
    );
    expect(state.rental.spaces.get(child.id)).toMatchObject({ name: "101A", code: "A-101" });
    registerSpaceAncestors(harness as TestAppHarness, child.id, left.id, property.id);
    (harness as TestAppHarness).state.rentalQuery.registerRead(
      "spaces.descendants",
      [testIds.organization, property.id, child.id],
      [],
    );
    (harness as TestAppHarness).state.rentalQuery.registerRead(
      "contracts.referenceSummary",
      [
        {
          organizationId: testIds.organization,
          propertyId: property.id,
          today: "2026-08-31",
          ownSpaceIds: [child.id],
          descendantSpaceIds: [],
          oldAncestorSpaceIds: [left.id],
          newAncestorSpaceIds: [right.id],
        },
      ],
      { own: false, descendant: false, oldAncestor: false, newAncestor: false },
    );
    expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/move",
        headers,
        payload: { id: child.id, parentId: right.id, sortOrder: 20 },
      }),
    );
    expect(state.rental.spaces.get(child.id)).toMatchObject({ parentId: right.id, sortOrder: 20 });
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/delete",
        headers,
        payload: { id: right.id },
      }),
      409,
      "CONFLICT",
    );
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-properties/delete",
        headers,
        payload: { id: property.id },
      }),
      409,
      "CONFLICT",
    );
    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/delete",
        headers,
        payload: { id: child.id },
      }),
    );
    expect(state.rental.spaces.get(child.id)?.deletedAt).toBeInstanceOf(Date);
    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/delete",
        headers,
        payload: { id: left.id },
      }),
    );
    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/delete",
        headers,
        payload: { id: right.id },
      }),
    );
    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/rental-properties/delete",
        headers,
        payload: { id: property.id },
      }),
    );
    expect(state.rental.properties.get(property.id)?.deletedAt).toBeInstanceOf(Date);
    expect(state.bookkeeping.ledgers.get(property.ledgerId)).toMatchObject({
      name: "阳光公寓二期",
      deletedAt: expect.any(Date),
    });
  });

  it("keeps member and viewer rental access read-only while allowing administrator writes", async () => {
    const { app } = await createHarness();
    const ownerHeaders = await authorization(app, "13800000001");
    const property = await createProperty(ownerHeaders);
    registerPropertyDetail(harness as TestAppHarness, property.id, "阳光公寓二期");
    registerPropertyList(harness as TestAppHarness, property.id);
    const memberHeaders = await authorization(app, "13800000002");
    const adminHeaders = await authorization(app, "13800000007");
    const viewerHeaders = await authorization(app, "13800000003");

    expectOk<RentalPropertyDetail>(
      await app.inject({
        method: "POST",
        url: "/api/rental-properties/update",
        headers: adminHeaders,
        payload: { id: property.id, name: "阳光公寓二期" },
      }),
    );
    for (const headers of [memberHeaders, viewerHeaders]) {
      expectOk(await app.inject({ method: "GET", url: "/api/rental-properties/list", headers }));
    }
    for (const headers of [memberHeaders, viewerHeaders]) {
      expectApiError(
        await app.inject({
          method: "POST",
          url: "/api/rental-properties/set-status",
          headers,
          payload: { id: property.id, isActive: false },
        }),
        403,
        "FORBIDDEN",
      );
    }
  });

  it("does not expose other-organization property or space IDs", async () => {
    const { app } = await createHarness();
    const headers = await authorization(app, "13800000001");
    for (const response of await Promise.all([
      app.inject({
        method: "GET",
        url: `/api/rental-properties/detail?id=${rentalTestIds.foreignProperty}`,
        headers,
      }),
      app.inject({
        method: "GET",
        url: `/api/rental-spaces/children?propertyId=${rentalTestIds.foreignProperty}`,
        headers,
      }),
      app.inject({
        method: "POST",
        url: "/api/rental-spaces/update",
        headers,
        payload: { id: rentalTestIds.foreignSpace, name: "越权" },
      }),
    ])) {
      expectApiError(response, 404, "NOT_FOUND");
    }
  });

  it("searches only root-reachable active paths in deterministic branch order and pages them", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, "13800000001");
    const property = await createProperty(headers);
    const rootA = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          name: "A 楼",
          type: "building",
          isRentable: false,
          sortOrder: 10,
        },
      }),
    );
    const rootB = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          name: "B 楼",
          type: "building",
          isRentable: false,
          sortOrder: 20,
        },
      }),
    );
    const rootC = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/create",
        headers,
        payload: {
          propertyId: property.id,
          name: "C 楼",
          type: "building",
          isRentable: false,
          sortOrder: 30,
        },
      }),
    );
    const createMatch = async (parentId: string, name: string, sortOrder: number) => {
      registerSpaceAncestors(harness as TestAppHarness, parentId, undefined, property.id);
      return expectOk<{ id: string }>(
        await app.inject({
          method: "POST",
          url: "/api/rental-spaces/create",
          headers,
          payload: {
            propertyId: property.id,
            parentId,
            name,
            type: "room",
            isRentable: true,
            sortOrder,
          },
        }),
      );
    };
    const aSecond = await createMatch(rootA.id, "匹配 A2", 20);
    const aFirst = await createMatch(rootA.id, "匹配 A1", 10);
    const bFirst = await createMatch(rootB.id, "匹配 B1", 10);
    const orphan = await createMatch(rootB.id, "匹配历史孤儿", 20);
    const cFirst = await createMatch(rootC.id, "匹配 C1", 10);
    const deletedRoot = state.rental.spaces.get(rootB.id);
    if (!deletedRoot) throw new Error("Expected test root to exist");
    state.rental.spaces.set(rootB.id, { ...deletedRoot, deletedAt: new Date() });

    registerSearchPage(
      harness as TestAppHarness,
      property.id,
      "匹配",
      1,
      [
        {
          ...spaceNode({
            id: aFirst.id,
            propertyId: property.id,
            parentId: rootA.id,
            name: "匹配 A1",
            type: "room",
            isRentable: true,
            sortOrder: 10,
          }),
          path: [
            { id: rootA.id, name: "A 楼" },
            { id: aFirst.id, name: "匹配 A1" },
          ],
        },
        {
          ...spaceNode({
            id: aSecond.id,
            propertyId: property.id,
            parentId: rootA.id,
            name: "匹配 A2",
            type: "room",
            isRentable: true,
            sortOrder: 20,
          }),
          path: [
            { id: rootA.id, name: "A 楼" },
            { id: aSecond.id, name: "匹配 A2" },
          ],
        },
      ],
      3,
      2,
    );
    registerSearchPage(
      harness as TestAppHarness,
      property.id,
      "匹配",
      2,
      [
        {
          ...spaceNode({
            id: cFirst.id,
            propertyId: property.id,
            parentId: rootC.id,
            name: "匹配 C1",
            type: "room",
            isRentable: true,
            sortOrder: 10,
          }),
          path: [
            { id: rootC.id, name: "C 楼" },
            { id: cFirst.id, name: "匹配 C1" },
          ],
        },
      ],
      3,
      2,
    );

    const firstPage = expectOk<RentalSpaceSearchPage>(
      await app.inject({
        method: "GET",
        url: `/api/rental-spaces/search?propertyId=${property.id}&keyword=%E5%8C%B9%E9%85%8D&page=1&pageSize=2`,
        headers,
      }),
    );
    expect(firstPage).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(firstPage.items).toEqual([
      expect.objectContaining({
        id: aFirst.id,
        path: [
          { id: rootA.id, name: "A 楼" },
          { id: aFirst.id, name: "匹配 A1" },
        ],
      }),
      expect.objectContaining({
        id: aSecond.id,
        path: [
          { id: rootA.id, name: "A 楼" },
          { id: aSecond.id, name: "匹配 A2" },
        ],
      }),
    ]);
    expect(firstPage.items.map((item) => item.id)).not.toContain(bFirst.id);
    expect(firstPage.items.map((item) => item.id)).not.toContain(orphan.id);
    const secondPage = expectOk<RentalSpaceSearchPage>(
      await app.inject({
        method: "GET",
        url: `/api/rental-spaces/search?propertyId=${property.id}&keyword=%E5%8C%B9%E9%85%8D&page=2&pageSize=2`,
        headers,
      }),
    );
    expect(secondPage).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(secondPage.items).toEqual([
      expect.objectContaining({
        id: cFirst.id,
        path: [
          { id: rootC.id, name: "C 楼" },
          { id: cFirst.id, name: "匹配 C1" },
        ],
      }),
    ]);
  });

  it("restores generated ledger, property, spaces and audit state when required audit fails", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, "13800000001");
    const ledgerCount = state.bookkeeping.ledgers.size;
    const propertyCount = state.rental.properties.size;
    const spaceCount = state.rental.spaces.size;
    const auditCount = state.auditLogs.length;
    state.failNextRequiredAuditAppendAfterPersist = true;

    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-properties/create",
        headers,
        payload: propertyPayload,
      }),
      500,
      "INTERNAL_ERROR",
    );
    expect(state.bookkeeping.ledgers).toHaveLength(ledgerCount);
    expect(state.rental.properties).toHaveLength(propertyCount);
    expect(state.rental.spaces).toHaveLength(spaceCount);
    expect(state.auditLogs).toHaveLength(auditCount);
    expect(state.failNextRequiredAuditAppendAfterPersist).toBe(false);
  });

  async function authorization(app: TestAppHarness["app"], phone: string) {
    const { accessToken } = await login(app, phone);
    return { authorization: `Bearer ${accessToken}` };
  }
});
