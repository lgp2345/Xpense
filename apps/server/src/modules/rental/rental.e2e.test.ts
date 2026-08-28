import type {
  RentalPropertyDetail,
  RentalSpaceChildrenPage,
  RentalSpaceSearchPage,
} from "@xpense/shared";
import { afterEach, describe, expect, it } from "vitest";

import { login, parseJson, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";
import { rentalTestIds } from "../../test/rental-test-harness.js";

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

/** 断言没有业务数据的成功响应。 */
function expectEmptyOk(response: InjectResponse): void {
  expect(response.statusCode).toBe(200);
  expect(parseJson(response)).toEqual({ code: "OK", message: "ok", data: null });
}

describe("Rental HTTP e2e", () => {
  let harness: TestAppHarness | null = null;

  afterEach(async () => {
    await harness?.app.close();
    harness = null;
  });

  async function createHarness(): Promise<TestAppHarness> {
    harness = await createTestApp({ bookkeeping: true, rental: true });
    return harness;
  }

  async function authorization(app: TestAppHarness["app"], phone: string) {
    const { accessToken } = await login(app, phone);
    return { authorization: `Bearer ${accessToken}` };
  }

  async function createProperty(headers: Record<string, string>): Promise<RentalPropertyDetail> {
    const { app } = harness ?? (await createHarness());
    return expectOk<RentalPropertyDetail>(
      await app.inject({
        method: "POST",
        url: "/api/rental-properties/create",
        headers,
        payload: propertyPayload,
      }),
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

    expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/set-status",
        headers,
        payload: { id: root.id, isActive: false },
      }),
    );
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
    expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/update",
        headers,
        payload: { id: child.id, name: "101A", code: "A-101" },
      }),
    );
    expect(state.rental.spaces.get(child.id)).toMatchObject({ name: "101A", code: "A-101" });
    expectOk<{ id: string }>(
      await app.inject({
        method: "POST",
        url: "/api/rental-spaces/move",
        headers,
        payload: { id: child.id, parentId: right.id, sortOrder: 20 },
      }),
    );
    expect(state.rental.spaces.get(child.id)).toMatchObject({ parentId: right.id, sortOrder: 20 });
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
    const createMatch = async (parentId: string, name: string, sortOrder: number) =>
      expectOk<{ id: string }>(
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
    const aSecond = await createMatch(rootA.id, "匹配 A2", 20);
    const aFirst = await createMatch(rootA.id, "匹配 A1", 10);
    const bFirst = await createMatch(rootB.id, "匹配 B1", 10);
    const orphan = await createMatch(rootB.id, "匹配历史孤儿", 20);
    const cFirst = await createMatch(rootC.id, "匹配 C1", 10);
    const deletedRoot = state.rental.spaces.get(rootB.id);
    if (!deletedRoot) throw new Error("Expected test root to exist");
    state.rental.spaces.set(rootB.id, { ...deletedRoot, deletedAt: new Date() });

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
});
