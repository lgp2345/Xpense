import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createIamApi } from "./iam-api";

describe("createIamApi", () => {
  function createHarness() {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => "access",
      fetchImpl: fetchMock,
    });

    return { api: createIamApi(client), fetchMock };
  }

  it("wraps member and role endpoints without organization id", async () => {
    const { api, fetchMock } = createHarness();

    await api.listMembers();
    await api.createMember({ userId: "user-1", roleId: "role-1" });
    await api.updateMember("member-1", { status: "disabled" });
    await api.listRoles();
    await api.createRole({ key: "bookkeeper", name: "Bookkeeper", permissionKeys: [] });
    await api.updateRole("role-1", { permissionKeys: ["roles.read"] });
    await api.deleteRole("role-1");
    await api.listPermissions();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/members",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "user-1", roleId: "role-1" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:4000/members/member-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "disabled" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "http://localhost:4000/roles/role-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("wraps audit query filters as query parameters", async () => {
    const { api, fetchMock } = createHarness();

    await api.listAuditLogs({
      action: "member.role.changed",
      actorUserId: "user-1",
      targetType: "member",
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-10T00:00:00.000Z"),
      page: 2,
      pageSize: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/audit-logs?action=member.role.changed&actorUserId=user-1&targetType=member&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-10T00%3A00%3A00.000Z&page=2&pageSize=25",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
