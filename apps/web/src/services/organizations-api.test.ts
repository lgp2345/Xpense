import { expect, it, vi } from "vitest";
import { createOrganizationsApi } from "./organizations-api";

it("uses explicit platform endpoints and bounded query parameters", async () => {
  const client = { get: vi.fn().mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 20 }) };
  const api = createOrganizationsApi(client as never);
  await api.list({ page: 2, pageSize: 20, name: "组织", status: "active" });
  expect(client.get).toHaveBeenCalledWith(
    "/organizations/list?page=2&pageSize=20&name=%E7%BB%84%E7%BB%87&status=active",
  );
  await api.detail("org");
  expect(client.get).toHaveBeenCalledWith("/organizations/detail?id=org");
});

it("keeps owner lookup precise and sends initial passwords only in the creation request body", async () => {
  const client = {
    get: vi.fn().mockResolvedValue(null),
    post: vi.fn().mockResolvedValue({ id: "org" }),
  };
  const api = createOrganizationsApi(client as never);
  await api.resolveOwner("13800000001");
  expect(client.get).toHaveBeenCalledWith("/organizations/owner-candidates/list?phone=13800000001");
  const input = {
    name: "组织",
    baseCurrency: "CNY" as const,
    timezone: "Asia/Shanghai",
    owners: [
      { kind: "new" as const, phone: "13800000001", initialPassword: "sample-initial-password" },
    ],
  };
  await api.create(input);
  expect(client.post).toHaveBeenCalledWith("/organizations/create", input);
});
