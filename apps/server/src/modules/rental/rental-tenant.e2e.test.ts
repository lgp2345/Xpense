import type { PermissionKey, RentalTenantDetail } from "@xpense/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { login, parseJson, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { cloneBookkeepingTestState } from "../../test/bookkeeping-test-state.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-harness.js";
import { FIXED_RENTAL_NOW } from "../../test/rental-test-state.js";
import { ContractPartiesService } from "./contract-parties.service.js";
import { TenantIdentityCryptoService } from "./tenant-identity-crypto.service.js";
import { TenantsService } from "./tenants.service.js";

type InjectResponse = { payload: string; statusCode: number };

const generatedTenantId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const adminUserId = "11111111-1111-4111-8111-111111111106";

function registerTenantDetail(setup: TestAppHarness, id = generatedTenantId, name = "测试租户") {
  const row = {
    id,
    organizationId: testIds.organization,
    type: "individual",
    name,
    phone: "13900000000",
    email: "tenant@example.com",
    primaryContactName: null,
    documentCountryCode: null,
    documentType: null,
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
  setup.state.rentalQuery.registerRead("tenants.detail", [testIds.organization, id], {
    ...row,
    contractCount: 0,
  });
  setup.state.rentalQuery.registerRead("tenants.findForUpdate", [testIds.organization, id], row);
}

function registerMissingTenantDetail(setup: TestAppHarness, id: string): void {
  setup.state.rentalQuery.registerRead("tenants.detail", [testIds.organization, id], null);
  setup.state.rentalQuery.registerRead("tenants.findForUpdate", [testIds.organization, id], null);
}

function registerTenantDocumentConflict(
  setup: TestAppHarness,
  documentNumber: string,
  result: { id: string } | null,
  excludeId?: string,
): void {
  const hash = setup.app.get(TenantIdentityCryptoService).lookupHash(testIds.organization, {
    countryCode: "CN",
    type: "national_id",
    documentNumber,
  });
  setup.state.rentalQuery.registerRead(
    "tenants.documentConflict",
    [testIds.organization, hash, excludeId],
    result,
  );
}

function registerTenantReference(setup: TestAppHarness, id: string, result: boolean): void {
  setup.state.rentalQuery.registerRead("tenants.reference", [testIds.organization, id], result);
}

function registerTenantMutation(
  setup: TestAppHarness,
  method: "tenants.update" | "tenants.status" | "tenants.delete",
  input: Record<string, unknown>,
  row: Record<string, unknown> | null,
  id: string,
): void {
  setup.state.rentalMutation.registerMutation(
    method,
    input as never,
    { tenant: { id, row } } as never,
  );
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

function snapshotTransactionState(setup: TestAppHarness) {
  return {
    rental: cloneRentalTestState(setup.state.rental),
    bookkeeping: cloneBookkeepingTestState(setup.state.bookkeeping),
    auditLogs: structuredClone(setup.state.auditLogs),
  };
}

function expectTransactionStateUnchanged(
  setup: TestAppHarness,
  snapshot: ReturnType<typeof snapshotTransactionState>,
): void {
  expect(cloneRentalTestState(setup.state.rental)).toEqual(snapshot.rental);
  expect(cloneBookkeepingTestState(setup.state.bookkeeping)).toEqual(snapshot.bookkeeping);
  expect(structuredClone(setup.state.auditLogs)).toEqual(snapshot.auditLogs);
}

type TenantMutationMethod = "update" | "status" | "delete";

async function authorizeTenantTestUser(app: TestAppHarness["app"], phone: string) {
  const { accessToken } = await login(app, phone);
  return { authorization: `Bearer ${accessToken}` };
}

async function createTenantMutationScenario(
  method: TenantMutationMethod,
  actorUserId: string = testIds.ownerUser,
  actorPhone: string = TEST_PHONES.owner,
) {
  const setup = await createTestApp({ bookkeeping: true, rental: true });
  registerTenantDetail(setup, generatedTenantId, "故障场景租户");
  setup.state.rentalQuery.registerRead(
    "tenants.documentConflict",
    [testIds.organization, null, undefined],
    null,
  );
  const headers = await authorizeTenantTestUser(setup.app, actorPhone);
  const created = expectOk<{ id: string }>(
    await setup.app.inject({
      method: "POST",
      url: "/api/rental-tenants/create",
      headers,
      payload: { type: "individual", name: "故障场景租户" },
    }),
  );
  const current = setup.state.rental.tenants.get(created.id);
  if (!current) throw new Error("Expected created tenant fixture");
  setup.state.rentalQuery.registerRead(
    "tenants.findForUpdate",
    [testIds.organization, created.id],
    current,
  );
  let input: Record<string, unknown>;
  let afterRow: Record<string, unknown> | null = null;
  let url: string;
  let payload: Record<string, unknown>;
  if (method === "update") {
    input = {
      id: created.id,
      organizationId: testIds.organization,
      type: "individual",
      name: "更新后的故障租户",
      phone: "13900000041",
      email: null,
      primaryContactName: null,
      documentCountryCode: null,
      documentType: null,
      documentTypeOtherName: null,
      documentNumberLookupHash: null,
      maskedDocumentNumber: null,
      sensitiveIdentityCiphertext: null,
      sensitiveIdentityKeyVersion: null,
      isActive: true,
      note: null,
      updatedByUserId: actorUserId,
    };
    afterRow = { ...current, ...input, updatedAt: new Date(FIXED_RENTAL_NOW) };
    url = "/api/rental-tenants/update";
    payload = { id: created.id, name: "更新后的故障租户", phone: "13900000041" };
  } else if (method === "status") {
    input = {
      organizationId: testIds.organization,
      id: created.id,
      isActive: false,
      updatedByUserId: actorUserId,
    };
    afterRow = { ...current, ...input, updatedAt: new Date(FIXED_RENTAL_NOW) };
    url = "/api/rental-tenants/set-status";
    payload = { id: created.id, isActive: false };
  } else {
    input = {
      organizationId: testIds.organization,
      id: created.id,
      deletedByUserId: actorUserId,
      updatedByUserId: actorUserId,
    };
    url = "/api/rental-tenants/delete";
    payload = { id: created.id };
    registerTenantReference(setup, created.id, false);
  }
  registerTenantMutation(setup, `tenants.${method}`, input, afterRow, created.id);
  if (afterRow) {
    setup.state.rentalQuery.registerRead("tenants.detail", [testIds.organization, created.id], {
      ...afterRow,
      contractCount: 0,
    });
  }
  return { setup, headers, id: created.id, url, payload, afterRow };
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
    registerTenantDetail(harness);
    harness.state.rentalQuery.registerRead(
      "tenants.documentConflict",
      [testIds.organization, null, undefined],
      null,
    );
    return harness;
  }

  it("does not decrypt a foreign contract tenant snapshot and returns the same not-found envelope", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    registerTenantDocumentConflict(harness as TestAppHarness, "110101199001011235", null);
    const created = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers,
        payload: {
          type: "individual",
          name: "有效密文租户",
          phone: "13900000001",
          documentCountryCode: "CN",
          documentType: "national_id",
          documentNumber: "110101199001011235",
          birthDate: "1990-01-01",
          gender: "male",
          documentAddress: "不会返回",
        },
      }),
    );
    const ciphertext = state.rental.tenants.get(created.id)?.sensitiveIdentityCiphertext;
    expect(ciphertext).toBeInstanceOf(Buffer);
    state.rental.partyPeriods.set(rentalTestIds.foreignContract, [
      {
        tenantId: rentalTestIds.foreignTenant,
        tenantType: "individual",
        tenantName: "跨组织租户",
        phone: null,
        email: null,
        primaryContactName: null,
        documentCountryCode: "CN",
        documentType: "national_id",
        documentTypeOtherName: null,
        maskedDocumentNumber: null,
        validFrom: "2026-08-01",
        validTo: "2026-12-31",
        isPrimaryPayer: true,
        identitySnapshotCiphertext: ciphertext ? Buffer.from(ciphertext) : null,
        identitySnapshotKeyVersion: 1,
      },
    ]);
    const before = cloneRentalTestState(state.rental);
    const response = await app.inject({
      method: "POST",
      url: "/api/rental-contracts/reveal-sensitive",
      headers,
      payload: {
        contractId: rentalTestIds.foreignContract,
        tenantId: rentalTestIds.foreignTenant,
        validFrom: "2026-08-01",
      },
    });
    expectApiError(response, 404, "NOT_FOUND");
    expect(cloneRentalTestState(state.rental)).toEqual(before);
  });

  it("keeps tenant reads available to members while sensitive reveal requires all permissions", async () => {
    const permissionCases: Array<{
      permissions: readonly PermissionKey[];
      statusCode: number;
    }> = [
      { permissions: ["rental_tenants:read"] as const, statusCode: 403 },
      { permissions: ["rental_tenants:sensitive_read"] as const, statusCode: 403 },
      {
        permissions: ["rental_tenants:read", "rental_tenants:sensitive_read"] as const,
        statusCode: 200,
      },
    ];
    for (const testCase of permissionCases) {
      const setup = await createTestApp({
        bookkeeping: true,
        rental: true,
        managerPermissions: testCase.permissions,
      });
      harness = setup;
      registerTenantDetail(setup, generatedTenantId, "权限矩阵租户");
      registerTenantDocumentConflict(setup, "110101199001011237", null);
      const ownerHeaders = await authorization(setup.app, TEST_PHONES.owner);
      const created = expectOk<{ id: string }>(
        await setup.app.inject({
          method: "POST",
          url: "/api/rental-tenants/create",
          headers: ownerHeaders,
          payload: {
            type: "individual",
            name: "权限矩阵租户",
            phone: "13900000003",
            documentCountryCode: "CN",
            documentType: "national_id",
            documentNumber: "110101199001011237",
          },
        }),
      );
      const managerHeaders = await authorization(setup.app, TEST_PHONES.manager);
      const detail = await setup.app.inject({
        method: "GET",
        url: `/api/rental-tenants/detail?id=${created.id}`,
        headers: managerHeaders,
      });
      if (testCase.permissions.includes("rental_tenants:read")) expectOk(detail);
      else expectApiError(detail, 403, "FORBIDDEN");
      const reveal = await setup.app.inject({
        method: "POST",
        url: "/api/rental-tenants/reveal-sensitive",
        headers: managerHeaders,
        payload: { id: created.id },
      });
      expect(reveal.statusCode).toBe(testCase.statusCode);
      await setup.app.close();
      harness = null;
    }
  });

  it("updates and changes tenant status through explicit effects with fault retry", async () => {
    const { app, state } = await createHarness();
    const ownerHeaders = await authorization(app, TEST_PHONES.owner);
    const adminHeaders = await authorization(app, "13800000007");
    const created = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers: ownerHeaders,
        payload: { type: "individual", name: "待更新租户", phone: "13900000008" },
      }),
    );
    registerTenantDetail(harness as TestAppHarness, created.id, "更新后的租户");
    const updateInput = {
      id: created.id,
      organizationId: testIds.organization,
      type: "individual" as const,
      name: "更新后的租户",
      phone: "13900000009",
      email: "tenant@example.com",
      primaryContactName: null,
      documentCountryCode: null,
      documentType: null,
      documentTypeOtherName: null,
      documentNumberLookupHash: null,
      maskedDocumentNumber: null,
      sensitiveIdentityCiphertext: null,
      sensitiveIdentityKeyVersion: null,
      isActive: true,
      note: null,
      updatedByUserId: testIds.ownerUser,
    };
    const updatedRow = {
      ...updateInput,
      createdByUserId: testIds.ownerUser,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: new Date(FIXED_RENTAL_NOW),
      updatedAt: new Date(FIXED_RENTAL_NOW),
    };
    registerTenantMutation(
      harness as TestAppHarness,
      "tenants.update",
      updateInput,
      updatedRow,
      created.id,
    );
    state.rentalQuery.registerRead("tenants.detail", [testIds.organization, created.id], {
      ...updatedRow,
      contractCount: 0,
    });
    state.rentalQuery.registerRead(
      "tenants.documentConflict",
      [testIds.organization, null, created.id],
      null,
    );
    const before = cloneRentalTestState(state.rental);
    state.rental.failNextRepositoryOperation = "tenants.update";
    expectApiError(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/update",
        headers: ownerHeaders,
        payload: { id: created.id, name: "更新后的租户", phone: "13900000009" },
      }),
      500,
      "INTERNAL_ERROR",
    );
    expect(cloneRentalTestState(state.rental)).toEqual(before);
    const updated = expectOk<RentalTenantDetail>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/update",
        headers: ownerHeaders,
        payload: { id: created.id, name: "更新后的租户", phone: "13900000009" },
      }),
    );
    expect(updated).toEqual({
      id: created.id,
      type: "individual",
      name: "更新后的租户",
      phone: "13900000009",
      email: "tenant@example.com",
      primaryContactName: null,
      documentCountryCode: null,
      documentType: null,
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      isActive: true,
      contractCount: 0,
      updatedAt: FIXED_RENTAL_NOW.toISOString(),
      note: null,
      createdAt: FIXED_RENTAL_NOW.toISOString(),
    });
    expect(state.rentalMutation.mutationCalls).toHaveLength(1);
    expect(
      state.auditLogs.filter((entry) => entry.action === "rental_tenant.updated"),
    ).toHaveLength(1);

    registerTenantDetail(harness as TestAppHarness, created.id, "更新后的租户");
    const statusInput = {
      organizationId: testIds.organization,
      id: created.id,
      isActive: false,
      updatedByUserId: adminUserId,
    };
    registerTenantMutation(
      harness as TestAppHarness,
      "tenants.status",
      statusInput,
      { ...updatedRow, isActive: false, updatedByUserId: adminUserId },
      created.id,
    );
    state.rentalQuery.registerRead("tenants.detail", [testIds.organization, created.id], {
      ...updatedRow,
      isActive: false,
      updatedByUserId: adminUserId,
      contractCount: 0,
    });
    expectOk(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/set-status",
        headers: adminHeaders,
        payload: { id: created.id, isActive: false },
      }),
    );
    expect(state.rental.tenants.get(created.id)?.isActive).toBe(false);
    expect(
      state.auditLogs.filter((entry) => entry.action === "rental_tenant.status_changed"),
    ).toHaveLength(1);
  });

  it("rolls back update after repository after-effect fault in a fresh scenario", async () => {
    const scenario = await createTenantMutationScenario("update");
    harness = scenario.setup;
    const before = snapshotTransactionState(scenario.setup);
    scenario.setup.state.rental.failNextRepositoryOperation = "tenants.update";
    scenario.setup.state.rental.failNextRepositoryOperationPhase = "after";
    expectApiError(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
      500,
      "INTERNAL_ERROR",
    );
    expectTransactionStateUnchanged(scenario.setup, before);
    expectOk(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
  });

  it("rolls back update after required audit post-persist fault in a fresh scenario", async () => {
    const scenario = await createTenantMutationScenario("update");
    harness = scenario.setup;
    const before = snapshotTransactionState(scenario.setup);
    scenario.setup.state.failNextRequiredAuditAppendAfterPersist = true;
    expectApiError(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
      500,
      "INTERNAL_ERROR",
    );
    expectTransactionStateUnchanged(scenario.setup, before);
    expectOk(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
  });

  it("rolls back status after repository after-effect fault and returns the fixed after row", async () => {
    const scenario = await createTenantMutationScenario("status");
    harness = scenario.setup;
    const before = snapshotTransactionState(scenario.setup);
    scenario.setup.state.rental.failNextRepositoryOperation = "tenants.status";
    scenario.setup.state.rental.failNextRepositoryOperationPhase = "after";
    expectApiError(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
      500,
      "INTERNAL_ERROR",
    );
    expectTransactionStateUnchanged(scenario.setup, before);
    const response = expectOk<RentalTenantDetail>(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
    expect(response).toEqual({
      id: scenario.id,
      type: "individual",
      name: "故障场景租户",
      phone: null,
      email: null,
      primaryContactName: null,
      documentCountryCode: null,
      documentType: null,
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      isActive: false,
      contractCount: 0,
      updatedAt: FIXED_RENTAL_NOW.toISOString(),
      note: null,
      createdAt: FIXED_RENTAL_NOW.toISOString(),
    });
  });

  it("rolls back status after required audit post-persist fault in a fresh scenario", async () => {
    const scenario = await createTenantMutationScenario("status");
    harness = scenario.setup;
    const before = snapshotTransactionState(scenario.setup);
    scenario.setup.state.failNextRequiredAuditAppendAfterPersist = true;
    expectApiError(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
      500,
      "INTERNAL_ERROR",
    );
    expectTransactionStateUnchanged(scenario.setup, before);
    expectOk(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
    const mutationCount = scenario.setup.state.rentalMutation.mutationCalls.length;
    const statusAuditCount = scenario.setup.state.auditLogs.filter(
      (entry) => entry.action === "rental_tenant.status_changed",
    ).length;
    scenario.setup.state.rentalQuery.registerRead(
      "tenants.findForUpdate",
      [testIds.organization, scenario.id],
      scenario.afterRow,
    );
    expectOk(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
    expect(scenario.setup.state.rentalMutation.mutationCalls).toHaveLength(mutationCount);
    expect(
      scenario.setup.state.auditLogs.filter(
        (entry) => entry.action === "rental_tenant.status_changed",
      ),
    ).toHaveLength(statusAuditCount);
  });

  it("rolls back delete after repository after-effect fault and returns 404 after deletion", async () => {
    const scenario = await createTenantMutationScenario("delete");
    harness = scenario.setup;
    const before = snapshotTransactionState(scenario.setup);
    scenario.setup.state.rental.failNextRepositoryOperation = "tenants.delete";
    scenario.setup.state.rental.failNextRepositoryOperationPhase = "after";
    expectApiError(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
      500,
      "INTERNAL_ERROR",
    );
    expectTransactionStateUnchanged(scenario.setup, before);
    expectEmptyOk(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
    registerMissingTenantDetail(scenario.setup, scenario.id);
    expectApiError(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("rolls back delete after required audit post-persist fault in a fresh scenario", async () => {
    const scenario = await createTenantMutationScenario("delete");
    harness = scenario.setup;
    const before = snapshotTransactionState(scenario.setup);
    scenario.setup.state.failNextRequiredAuditAppendAfterPersist = true;
    expectApiError(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
      500,
      "INTERNAL_ERROR",
    );
    expectTransactionStateUnchanged(scenario.setup, before);
    expectEmptyOk(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
  });

  it("allows each owner/admin tenant route through an independent success oracle", async () => {
    const ownerUpdate = await createTenantMutationScenario("update");
    harness = ownerUpdate.setup;
    const ownerUpdateResponse = expectOk<RentalTenantDetail>(
      await ownerUpdate.setup.app.inject({
        method: "POST",
        url: ownerUpdate.url,
        headers: ownerUpdate.headers,
        payload: ownerUpdate.payload,
      }),
    );
    expect(ownerUpdateResponse).toMatchObject({
      id: ownerUpdate.id,
      name: "更新后的故障租户",
      phone: "13900000041",
      isActive: true,
      contractCount: 0,
    });
    await ownerUpdate.setup.app.close();
    harness = null;

    const adminUpdate = await createTenantMutationScenario("update", adminUserId, "13800000007");
    harness = adminUpdate.setup;
    const adminUpdateResponse = expectOk<RentalTenantDetail>(
      await adminUpdate.setup.app.inject({
        method: "POST",
        url: adminUpdate.url,
        headers: adminUpdate.headers,
        payload: adminUpdate.payload,
      }),
    );
    expect(adminUpdateResponse).toEqual({
      id: adminUpdate.id,
      type: "individual",
      name: "更新后的故障租户",
      phone: "13900000041",
      email: null,
      primaryContactName: null,
      documentCountryCode: null,
      documentType: null,
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      isActive: true,
      contractCount: 0,
      updatedAt: FIXED_RENTAL_NOW.toISOString(),
      note: null,
      createdAt: FIXED_RENTAL_NOW.toISOString(),
    });
    expect(adminUpdate.setup.state.rental.tenants.get(adminUpdate.id)).toMatchObject({
      id: adminUpdate.id,
      organizationId: testIds.organization,
      name: "更新后的故障租户",
      phone: "13900000041",
      updatedByUserId: adminUserId,
      isActive: true,
    });
    expect(
      adminUpdate.setup.state.auditLogs.filter(
        (entry) =>
          entry.targetId === adminUpdate.id &&
          entry.action === "rental_tenant.updated" &&
          entry.actorUserId === adminUserId,
      ),
    ).toHaveLength(1);
    await adminUpdate.setup.app.close();
    harness = null;

    const ownerStatus = await createTenantMutationScenario("status");
    harness = ownerStatus.setup;
    const ownerStatusResponse = expectOk<RentalTenantDetail>(
      await ownerStatus.setup.app.inject({
        method: "POST",
        url: ownerStatus.url,
        headers: ownerStatus.headers,
        payload: ownerStatus.payload,
      }),
    );
    expect(ownerStatusResponse).toEqual({
      id: ownerStatus.id,
      type: "individual",
      name: "故障场景租户",
      phone: null,
      email: null,
      primaryContactName: null,
      documentCountryCode: null,
      documentType: null,
      documentTypeOtherName: null,
      maskedDocumentNumber: null,
      isActive: false,
      contractCount: 0,
      updatedAt: FIXED_RENTAL_NOW.toISOString(),
      note: null,
      createdAt: FIXED_RENTAL_NOW.toISOString(),
    });
    expect(ownerStatus.setup.state.rental.tenants.get(ownerStatus.id)?.isActive).toBe(false);
    expect(
      ownerStatus.setup.state.auditLogs.filter(
        (entry) =>
          entry.targetId === ownerStatus.id &&
          entry.action === "rental_tenant.status_changed" &&
          entry.actorUserId === testIds.ownerUser,
      ),
    ).toHaveLength(1);
    await ownerStatus.setup.app.close();
    harness = null;

    const adminStatus = await createTenantMutationScenario("status");
    harness = adminStatus.setup;
    const adminHeaders = await authorization(adminStatus.setup.app, "13800000007");
    const adminInput = { ...adminStatus.afterRow, updatedByUserId: adminUserId };
    const statusMutationInput = {
      organizationId: testIds.organization,
      id: adminStatus.id,
      isActive: false,
      updatedByUserId: adminUserId,
    };
    registerTenantMutation(
      adminStatus.setup,
      "tenants.status",
      statusMutationInput,
      adminInput,
      adminStatus.id,
    );
    adminStatus.setup.state.rentalQuery.registerRead(
      "tenants.detail",
      [testIds.organization, adminStatus.id],
      { ...adminInput, contractCount: 0 },
    );
    const adminStatusResponse = expectOk<RentalTenantDetail>(
      await adminStatus.setup.app.inject({
        method: "POST",
        url: "/api/rental-tenants/set-status",
        headers: adminHeaders,
        payload: { id: adminStatus.id, isActive: false },
      }),
    );
    expect(adminStatusResponse).toMatchObject({
      id: adminStatus.id,
      isActive: false,
      contractCount: 0,
    });
    await adminStatus.setup.app.close();
    harness = null;

    const ownerDelete = await createTenantMutationScenario("delete");
    harness = ownerDelete.setup;
    expectEmptyOk(
      await ownerDelete.setup.app.inject({
        method: "POST",
        url: ownerDelete.url,
        headers: ownerDelete.headers,
        payload: ownerDelete.payload,
      }),
    );
    await ownerDelete.setup.app.close();
    harness = null;

    const adminDelete = await createTenantMutationScenario("delete", adminUserId, "13800000007");
    harness = adminDelete.setup;
    expectEmptyOk(
      await adminDelete.setup.app.inject({
        method: "POST",
        url: adminDelete.url,
        headers: adminDelete.headers,
        payload: adminDelete.payload,
      }),
    );
    expect(adminDelete.setup.state.rental.tenants.has(adminDelete.id)).toBe(false);
    expect(
      adminDelete.setup.state.auditLogs.some(
        (entry) =>
          entry.targetId === adminDelete.id &&
          entry.action === "rental_tenant.deleted" &&
          entry.actorUserId === adminUserId,
      ),
    ).toBe(true);
    await adminDelete.setup.app.close();
    harness = null;
  });

  it("keeps status idempotent after registering the inactive fixture", async () => {
    const scenario = await createTenantMutationScenario("status");
    harness = scenario.setup;
    expectOk(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
    const afterRow = scenario.afterRow;
    scenario.setup.state.rentalQuery.registerRead(
      "tenants.findForUpdate",
      [testIds.organization, scenario.id],
      afterRow,
    );
    const mutationCount = scenario.setup.state.rentalMutation.mutationCalls.length;
    const auditCount = scenario.setup.state.auditLogs.filter(
      (entry) => entry.action === "rental_tenant.status_changed",
    ).length;
    const response = expectOk<RentalTenantDetail>(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
    expect(response.isActive).toBe(false);
    expect(scenario.setup.state.rentalMutation.mutationCalls).toHaveLength(mutationCount);
    expect(
      scenario.setup.state.auditLogs.filter(
        (entry) => entry.action === "rental_tenant.status_changed",
      ),
    ).toHaveLength(auditCount);
  });

  it("keeps delete idempotency as a not-found after registering the deleted fixture", async () => {
    const scenario = await createTenantMutationScenario("delete");
    harness = scenario.setup;
    expectEmptyOk(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
    );
    registerMissingTenantDetail(scenario.setup, scenario.id);
    expectApiError(
      await scenario.setup.app.inject({
        method: "POST",
        url: scenario.url,
        headers: scenario.headers,
        payload: scenario.payload,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("allows admin writes while member and viewer remain read-only", async () => {
    const { app } = await createHarness();
    const adminHeaders = await authorization(app, "13800000007");
    const created = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers: adminHeaders,
        payload: { type: "individual", name: "管理员租户", phone: "13900000005" },
      }),
    );
    for (const phone of [TEST_PHONES.manager, TEST_PHONES.viewer]) {
      const headers = await authorization(app, phone);
      expectOk(
        await app.inject({
          method: "GET",
          url: `/api/rental-tenants/detail?id=${created.id}`,
          headers,
        }),
      );
      const write = await app.inject({
        method: "POST",
        url: "/api/rental-tenants/update",
        headers,
        payload: { id: created.id, name: "不得写入" },
      });
      expectApiError(write, 403, "FORBIDDEN");
      for (const request of [
        { url: "/api/rental-tenants/set-status", payload: { id: created.id, isActive: false } },
        { url: "/api/rental-tenants/delete", payload: { id: created.id } },
      ]) {
        expectApiError(
          await app.inject({ method: "POST", url: request.url, headers, payload: request.payload }),
          403,
          "FORBIDDEN",
        );
      }
    }
  });

  it("returns the fixed sensitive identity to owner and admin through real reveal", async () => {
    const { app, state } = await createHarness();
    const ownerHeaders = await authorization(app, TEST_PHONES.owner);
    registerTenantDocumentConflict(harness as TestAppHarness, "110101199001011238", null);
    const created = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers: ownerHeaders,
        payload: {
          type: "individual",
          name: "真实揭示租户",
          documentCountryCode: "CN",
          documentType: "national_id",
          documentNumber: "110101199001011238",
          birthDate: "1990-01-02",
          gender: "female",
          ethnicity: "汉族",
          documentAddress: "固定地址",
        },
      }),
    );
    const stored = state.rental.tenants.get(created.id);
    expect(stored).toBeDefined();
    harness?.state.rentalQuery.registerRead("tenants.detail", [testIds.organization, created.id], {
      ...stored,
      contractCount: 0,
    });
    const expected = {
      tenantId: created.id,
      documentNumber: "110101199001011238",
      birthDate: "1990-01-02",
      gender: "female",
      ethnicity: "汉族",
      documentAddress: "固定地址",
    };
    expect(
      parseJson<{ code: string; message: string; data: typeof expected }>(
        await app.inject({
          method: "POST",
          url: "/api/rental-tenants/reveal-sensitive",
          headers: ownerHeaders,
          payload: { id: created.id },
        }),
      ),
    ).toEqual({ code: "OK", message: "ok", data: expected });
    const adminHeaders = await authorization(app, "13800000007");
    expect(
      parseJson<{ code: string; message: string; data: typeof expected }>(
        await app.inject({
          method: "POST",
          url: "/api/rental-tenants/reveal-sensitive",
          headers: adminHeaders,
          payload: { id: created.id },
        }),
      ),
    ).toEqual({ code: "OK", message: "ok", data: expected });
  });

  it("uses one safe not-found response for tenant write and reveal targets", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    const ids: [string, string, string] = [
      rentalTestIds.foreignTenant,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa98",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99",
    ];
    const activeFixture = state.rental.tenants.get(rentalTestIds.tenant);
    if (!activeFixture) throw new Error("Expected active tenant fixture");
    state.rental.tenants.set(ids[2], {
      ...activeFixture,
      id: ids[2],
      name: "已删除租户",
      deletedAt: new Date(FIXED_RENTAL_NOW),
      deletedByUserId: testIds.ownerUser,
    });
    for (const id of ids) registerMissingTenantDetail(harness as TestAppHarness, id);
    const requests = [
      {
        method: "POST" as const,
        url: "/api/rental-tenants/update",
        payload: { id: ids[0], name: "无效" },
      },
      {
        method: "POST" as const,
        url: "/api/rental-tenants/set-status",
        payload: { id: ids[0], isActive: false },
      },
      { method: "POST" as const, url: "/api/rental-tenants/delete", payload: { id: ids[0] } },
      {
        method: "POST" as const,
        url: "/api/rental-tenants/reveal-sensitive",
        payload: { id: ids[0] },
      },
    ];
    for (const id of ids) {
      for (const request of requests) {
        const before = snapshotTransactionState(harness as TestAppHarness);
        expectApiError(
          await app.inject({ ...request, headers, payload: { ...request.payload, id } }),
          404,
          "NOT_FOUND",
        );
        expectTransactionStateUnchanged(harness as TestAppHarness, before);
      }
    }
  });

  it("rejects duplicate update and referenced delete without sensitive conflict details", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    const firstDocument = "110101199001011239";
    const secondDocument = "110101199001011240";
    registerTenantDocumentConflict(harness as TestAppHarness, firstDocument, null);
    const first = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers,
        payload: {
          type: "individual",
          name: "重复目标",
          documentCountryCode: "CN",
          documentType: "national_id",
          documentNumber: firstDocument,
        },
      }),
    );
    registerTenantDocumentConflict(harness as TestAppHarness, secondDocument, null);
    registerTenantDetail(
      harness as TestAppHarness,
      "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
      "重复来源",
    );
    const second = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers,
        payload: {
          type: "individual",
          name: "重复来源",
          documentCountryCode: "CN",
          documentType: "national_id",
          documentNumber: secondDocument,
        },
      }),
    );
    const target = state.rental.tenants.get(first.id);
    expect(target).toBeDefined();
    registerTenantDetail(harness as TestAppHarness, first.id, "重复目标");
    registerTenantDocumentConflict(
      harness as TestAppHarness,
      secondDocument,
      { id: second.id },
      first.id,
    );
    const before = cloneRentalTestState(state.rental);
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/rental-tenants/update",
      headers,
      payload: {
        id: first.id,
        documentCountryCode: "CN",
        documentType: "national_id",
        documentNumber: secondDocument,
      },
    });
    expectSafeConflict(duplicate);
    expect(cloneRentalTestState(state.rental)).toEqual(before);

    registerTenantDetail(
      harness as TestAppHarness,
      "aaaaaaaa-aaaa-4aaa-8aaa-000000000003",
      "被引用租户",
    );
    const referenced = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers,
        payload: { type: "individual", name: "被引用租户" },
      }),
    );
    registerTenantDetail(harness as TestAppHarness, referenced.id, "被引用租户");
    registerTenantReference(harness as TestAppHarness, referenced.id, true);
    expectSafeConflict(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/delete",
        headers,
        payload: { id: referenced.id },
      }),
    );
  });

  it("uses one not-found contract for foreign, missing, and deleted tenant reads", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    const deleted = expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/create",
        headers,
        payload: { type: "individual", name: "待删除租户", phone: "13900000004" },
      }),
    );
    registerTenantDetail(harness as TestAppHarness, deleted.id, "待删除租户");
    registerTenantReference(harness as TestAppHarness, deleted.id, false);
    registerTenantMutation(
      harness as TestAppHarness,
      "tenants.delete",
      {
        organizationId: testIds.organization,
        id: deleted.id,
        deletedByUserId: testIds.ownerUser,
        updatedByUserId: testIds.ownerUser,
      },
      {
        id: deleted.id,
        organizationId: testIds.organization,
        type: "individual",
        name: "待删除租户",
        phone: "13900000004",
        email: null,
        primaryContactName: null,
        documentCountryCode: null,
        documentType: null,
        documentTypeOtherName: null,
        maskedDocumentNumber: null,
        documentNumberLookupHash: null,
        sensitiveIdentityCiphertext: null,
        sensitiveIdentityKeyVersion: null,
        isActive: true,
        note: null,
        createdByUserId: testIds.ownerUser,
        updatedByUserId: testIds.ownerUser,
        deletedAt: new Date(FIXED_RENTAL_NOW),
        deletedByUserId: testIds.ownerUser,
        createdAt: new Date(FIXED_RENTAL_NOW),
        updatedAt: new Date(FIXED_RENTAL_NOW),
      },
      deleted.id,
    );
    expectEmptyOk(
      await app.inject({
        method: "POST",
        url: "/api/rental-tenants/delete",
        headers,
        payload: { id: deleted.id },
      }),
    );
    registerMissingTenantDetail(harness as TestAppHarness, deleted.id);
    registerMissingTenantDetail(harness as TestAppHarness, rentalTestIds.foreignTenant);
    registerMissingTenantDetail(harness as TestAppHarness, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99");
    expect(state.rental.tenants.get(deleted.id)?.deletedAt).toBeInstanceOf(Date);
    for (const id of [
      rentalTestIds.foreignTenant,
      deleted.id,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99",
    ]) {
      expectApiError(
        await app.inject({
          method: "GET",
          url: `/api/rental-tenants/detail?id=${id}`,
          headers,
        }),
        404,
        "NOT_FOUND",
      );
    }
  });

  it("creates tenants through the real HTTP service and rejects duplicate documents atomically", async () => {
    const { app, state } = await createHarness();
    const headers = await authorization(app, TEST_PHONES.owner);
    const payload = {
      type: "individual",
      name: "张三",
      phone: "13900000000",
      documentCountryCode: "CN",
      documentType: "national_id",
      documentNumber: "110101199001011234",
      birthDate: "1990-01-01",
      gender: "male",
      documentAddress: "深圳市南山区",
      note: "敏感备注",
    };
    registerTenantDocumentConflict(harness as TestAppHarness, payload.documentNumber, null);
    const created = expectOk<{ id: string }>(
      await app.inject({ method: "POST", url: "/api/rental-tenants/create", headers, payload }),
    );
    registerTenantDocumentConflict(harness as TestAppHarness, "110101199001011234", {
      id: created.id,
    });
    expect(state.rental.tenants.get(created.id)?.sensitiveIdentityCiphertext).toBeInstanceOf(
      Buffer,
    );
    const before = cloneRentalTestState(state.rental);
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/rental-tenants/create",
      headers,
      payload,
    });
    expectSafeConflict(duplicate);
    expect(cloneRentalTestState(state.rental)).toEqual(before);
  });

  it.each([
    {
      title: "tenant reveal",
      url: "/api/rental-tenants/reveal-sensitive",
      read: "rental_tenants:read" as const,
      sensitive: "rental_tenants:sensitive_read" as const,
      payload: { id: testIds.ownerUser },
      service: TenantsService,
      method: "revealSensitive" as const,
    },
    {
      title: "contract history reveal",
      url: "/api/rental-contracts/reveal-sensitive",
      read: "rental_contracts:read" as const,
      sensitive: "rental_tenants:sensitive_read" as const,
      payload: {
        contractId: testIds.ownerUser,
        tenantId: testIds.managerUser,
        validFrom: "2026-01-01",
      },
      service: ContractPartiesService,
      method: "revealSensitive" as const,
    },
  ])("$title enforces read plus sensitive permission at the HTTP boundary", async (route) => {
    const cases = [
      { permissions: [route.read], statusCode: 403, invokesService: false },
      { permissions: [route.sensitive], statusCode: 403, invokesService: false },
      { permissions: [route.read, route.sensitive], statusCode: 200, invokesService: true },
    ] as const;

    for (const testCase of cases) {
      const setup = await createTestApp({
        bookkeeping: true,
        rental: true,
        managerPermissions: testCase.permissions,
      });
      harness = setup;
      registerTenantDetail(setup, generatedTenantId, "权限矩阵租户");
      const service = setup.app.get(route.service);
      const reveal = vi.spyOn(service, route.method).mockResolvedValue({} as never);
      const headers = await authorization(setup.app, TEST_PHONES.manager);
      const response = await setup.app.inject({
        method: "POST",
        url: route.url,
        headers,
        payload: route.payload,
      });

      expect(response.statusCode).toBe(testCase.statusCode);
      expect(reveal).toHaveBeenCalledTimes(testCase.invokesService ? 1 : 0);
      await setup.app.close();
      harness = null;
    }
  });

  async function authorization(app: TestAppHarness["app"], phone: string) {
    const { accessToken } = await login(app, phone);
    return { authorization: `Bearer ${accessToken}` };
  }
});
