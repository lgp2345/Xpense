import { afterEach, describe, expect, it } from "vitest";

import { login, parseJson, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";
import type { AuditLogRecord } from "./audit.types.js";

type AuditListResponse = {
  code: string;
  message: string;
  data: AuditLogRecord[];
};

/** 创建只包含查询测试所需字段的审计记录。 */
function createAuditLog(
  id: string,
  createdAt: string,
  overrides: Partial<AuditLogRecord> = {},
): AuditLogRecord {
  return {
    id,
    organizationId: testIds.organization,
    actorUserId: testIds.ownerUser,
    action: "roles.update",
    targetType: "role",
    targetId: testIds.viewerRole,
    result: "succeeded",
    metadata: {},
    requestId: null,
    createdAt: new Date(createdAt),
    ...overrides,
  };
}

describe("Audit e2e", () => {
  let harness: TestAppHarness | null = null;

  afterEach(async () => {
    await harness?.app.close();
    harness = null;
  });

  async function createHarness(): Promise<TestAppHarness> {
    harness = await createTestApp();
    return harness;
  }

  it("applies pagination defaults and coerces explicit page parameters", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "13800000001");
    state.auditLogs.push(
      createAuditLog("audit-oldest", "2026-01-01T00:00:00.000Z"),
      createAuditLog("audit-middle", "2026-01-02T00:00:00.000Z"),
      createAuditLog("audit-newest", "2026-01-03T00:00:00.000Z"),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/audit-logs/list?action=roles.update&page=2&pageSize=1",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(parseJson<AuditListResponse>(response).data.map((log) => log.id)).toEqual([
      "audit-middle",
    ]);
  });

  it("coerces date filters and limits results to the requested interval", async () => {
    const { app, state } = await createHarness();
    const { accessToken } = await login(app, "13800000001");
    state.auditLogs.push(
      createAuditLog("audit-before", "2026-01-01T00:00:00.000Z"),
      createAuditLog("audit-inside", "2026-01-02T00:00:00.000Z"),
      createAuditLog("audit-after", "2026-01-03T00:00:00.000Z"),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/audit-logs/list?from=2026-01-02T00:00:00.000Z&to=2026-01-02T23:59:59.999Z",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(parseJson<AuditListResponse>(response).data.map((log) => log.id)).toEqual([
      "audit-inside",
    ]);
  });

  it.each([
    ["invalid date", "from=not-a-date"],
    ["page below minimum", "page=0"],
    ["page size above maximum", "pageSize=101"],
  ])("rejects %s", async (_title, query) => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "13800000001");

    const response = await app.inject({
      method: "GET",
      url: `/api/audit-logs/list?${query}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(400);
    expect(parseJson(response)).toEqual({
      code: "VALIDATION_FAILED",
      message: expect.any(String),
      data: null,
    });
  });
});
