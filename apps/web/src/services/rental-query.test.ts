import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { bookkeepingKeys } from "./bookkeeping-query";
import type { RentalApi } from "./rental-api";
import {
  clearRentalQueries,
  invalidatePropertyMutation,
  invalidateSpaceMutation,
  rentalKeys,
  rentalQueryOptions,
} from "./rental-query";

function createApi(overrides: Partial<RentalApi> = {}): RentalApi {
  return {
    listProperties: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    getProperty: vi.fn(),
    createProperty: vi.fn(),
    updateProperty: vi.fn(),
    setPropertyStatus: vi.fn(),
    deleteProperty: vi.fn(),
    listChildren: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
    searchSpaces: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    createSpace: vi.fn(),
    batchCreateSpaces: vi.fn(),
    updateSpace: vi.fn(),
    moveSpace: vi.fn(),
    setSpaceStatus: vi.fn(),
    deleteSpace: vi.fn(),
    ...overrides,
  } as RentalApi;
}

describe("rental query cache", () => {
  it("deduplicates equivalent reads while including organization, property and paging scope in keys", async () => {
    const api = createApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = rentalQueryOptions.children(api, "org-a", {
      propertyId: "p1",
      parentId: null,
      page: 1,
      pageSize: 50,
    });
    const equal = rentalQueryOptions.children(api, "org-a", {
      propertyId: "p1",
      pageSize: 50,
      page: 1,
    });
    const nextPage = rentalQueryOptions.children(api, "org-a", {
      propertyId: "p1",
      parentId: null,
      page: 2,
      pageSize: 50,
    });

    await Promise.all([client.fetchQuery(first), client.fetchQuery(equal)]);

    expect(api.listChildren).toHaveBeenCalledOnce();
    expect(api.listChildren).toHaveBeenCalledWith({
      propertyId: "p1",
      parentId: null,
      page: 1,
      pageSize: 50,
    });
    expect(first.queryKey).toEqual(equal.queryKey);
    expect(nextPage.queryKey).not.toEqual(first.queryKey);
    expect(
      rentalKeys
        .children("org-a", { propertyId: "p1", parentId: null, page: 1, pageSize: 50 })
        .slice(0, 2),
    ).toEqual(["rental", "org-a"]);
  });

  it("invalidates only data affected by property and space writes, then removes every rental scope", async () => {
    const client = new QueryClient();
    const organizationId = "org-a";
    const propertyId = "property-1";
    const keys = {
      bookkeepingLedgers: bookkeepingKeys.ledgers(organizationId),
      children: rentalKeys.children(organizationId, {
        propertyId,
        parentId: null,
        page: 1,
        pageSize: 50,
      }),
      otherChildren: rentalKeys.children(organizationId, {
        propertyId: "property-2",
        parentId: null,
        page: 1,
        pageSize: 50,
      }),
      detail: rentalKeys.property(organizationId, propertyId),
      otherDetail: rentalKeys.property(organizationId, "property-2"),
      properties: rentalKeys.properties(organizationId, { page: 1, pageSize: 20 }),
      search: rentalKeys.search(organizationId, {
        propertyId,
        keyword: "101",
        page: 1,
        pageSize: 20,
      }),
      space: rentalKeys.space(organizationId, propertyId, "space-1"),
    };
    for (const key of Object.values(keys)) client.setQueryData(key, []);

    await invalidatePropertyMutation(client, organizationId, propertyId);
    expect(client.getQueryState(keys.properties)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.detail)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.bookkeepingLedgers)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.otherDetail)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.children)?.isInvalidated).toBe(false);

    client.getQueryCache().clear();
    for (const key of Object.values(keys)) client.setQueryData(key, []);
    await invalidateSpaceMutation(client, organizationId, propertyId, "space-1");
    expect(client.getQueryState(keys.properties)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.children)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.search)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.space)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.otherChildren)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.otherDetail)?.isInvalidated).toBe(false);

    clearRentalQueries(client);
    expect(client.getQueryState(keys.properties)).toBeUndefined();
    expect(client.getQueryState(keys.bookkeepingLedgers)).toBeDefined();
  });
});
