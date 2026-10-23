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
