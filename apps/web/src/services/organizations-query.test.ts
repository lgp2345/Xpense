import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  clearOrganizationsQueries,
  normalizeOrganizationQuery,
  organizationsKeys,
} from "./organizations-query";

describe("platform organization queries", () => {
  it("restores filters and pagination from URL search", () => {
    expect(
      normalizeOrganizationQuery({
        page: "2",
        pageSize: "50",
        name: "  组织  ",
        status: "disabled",
      }),
    ).toEqual({ page: 2, pageSize: 50, name: "组织", status: "disabled" });
  });
  it("bounds malformed URL search without forwarding extra fields", () => {
    expect(
      normalizeOrganizationQuery({
        page: -1,
        pageSize: 200,
        status: "other",
        organizationId: "spoof",
      }),
    ).toEqual({ page: 1, pageSize: 20 });
  });
  it("removes cached platform records while preserving unrelated query domains", () => {
    const client = new QueryClient();
    const key = organizationsKeys.list("user-a", { page: 1, pageSize: 20 });
    client.setQueryData(key, { items: [{ id: "private-org" }] });
    client.setQueryData(["other"], "keep");
    clearOrganizationsQueries(client);
    expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getQueryData(["other"])).toBe("keep");
  });
  it("isolates platform records by authenticated user", () => {
    const query = { page: 1, pageSize: 20 };
    expect(organizationsKeys.list("user-a", query)).toEqual([
      "platform-organizations",
      "user-a",
      "list",
      query,
    ]);
    expect(organizationsKeys.list("user-a", query)).not.toEqual(
      organizationsKeys.list("user-b", query),
    );
  });
});
