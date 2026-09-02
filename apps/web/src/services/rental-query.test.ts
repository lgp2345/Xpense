import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { bookkeepingKeys } from "./bookkeeping-query";
import type { RentalApi } from "./rental-api";
import {
  clearRentalQueries,
  createEphemeralRentalReveal,
  invalidateContractMutation,
  invalidateDeletedContractMutation,
  invalidateDeletedTenantMutation,
  invalidatePropertyMutation,
  invalidatePropertyStatusMutation,
  invalidateSpaceMutation,
  invalidateTenantMutation,
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
    listTenants: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    tenantDetail: vi.fn(),
    createTenant: vi.fn(),
    updateTenant: vi.fn(),
    setTenantStatus: vi.fn(),
    deleteTenant: vi.fn(),
    revealTenantSensitive: vi.fn(),
    listContracts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    contractDetail: vi.fn(),
    createContract: vi.fn(),
    updateContract: vi.fn(),
    checkContractAvailability: vi.fn(),
    confirmContract: vi.fn(),
    cancelContract: vi.fn(),
    changeContractParties: vi.fn(),
    terminateContract: vi.fn(),
    revokeContractTermination: vi.fn(),
    renewContract: vi.fn(),
    deleteContract: vi.fn(),
    revealContractPartySensitive: vi.fn(),
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
      rawBookkeepingLedgers: bookkeepingKeys.ledgers(organizationId),
      personalBookkeepingLedgers: bookkeepingKeys.personalLedgers(organizationId),
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
    expect(client.getQueryState(keys.rawBookkeepingLedgers)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.personalBookkeepingLedgers)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.otherDetail)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.children)?.isInvalidated).toBe(false);

    client.getQueryCache().clear();
    for (const key of Object.values(keys)) client.setQueryData(key, []);
    await invalidateSpaceMutation(client, organizationId, propertyId, "space-1");
    expect(client.getQueryState(keys.properties)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.detail)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.children)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.search)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.space)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.otherChildren)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.otherDetail)?.isInvalidated).toBe(false);

    client.getQueryCache().clear();
    for (const key of Object.values(keys)) client.setQueryData(key, []);
    await invalidatePropertyStatusMutation(client, organizationId, propertyId);
    expect(client.getQueryState(keys.properties)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.detail)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.children)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.search)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.otherChildren)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.otherDetail)?.isInvalidated).toBe(false);

    clearRentalQueries(client);
    expect(client.getQueryState(keys.properties)).toBeUndefined();
    expect(client.getQueryState(keys.rawBookkeepingLedgers)).toBeDefined();
  });

  it("keeps tenant, contract, and draft keys isolated by organization", () => {
    const tenantQuery = { keyword: "  tenant  ", isActive: false, page: 2, pageSize: 50 };
    const contractQuery = {
      keyword: " contract ",
      status: "active" as const,
      page: 1,
      pageSize: 20,
    };

    expect(rentalKeys.tenants("org-a", tenantQuery)).not.toEqual(
      rentalKeys.tenants("org-b", tenantQuery),
    );
    expect(rentalKeys.tenant("org-a", "tenant-1")).not.toEqual(
      rentalKeys.tenant("org-b", "tenant-1"),
    );
    expect(rentalKeys.contracts("org-a", contractQuery)).not.toEqual(
      rentalKeys.contracts("org-b", contractQuery),
    );
    expect(rentalKeys.contract("org-a", "contract-1")).not.toEqual(
      rentalKeys.contract("org-b", "contract-1"),
    );
    expect(rentalKeys.contractDraft("org-a", "draft-1")).not.toEqual(
      rentalKeys.contractDraft("org-b", "draft-1"),
    );
    expect(rentalKeys.tenants("org-a", tenantQuery).slice(0, 2)).toEqual(["rental", "org-a"]);
    expect(rentalKeys.contracts("org-a", contractQuery).slice(0, 2)).toEqual(["rental", "org-a"]);
  });

  it("uses one normalized object for tenant and contract keys and API calls", async () => {
    const api = createApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tenantOptions = rentalQueryOptions.tenants(api, "org-a", {
      keyword: "  tenant  ",
      documentNumber: "  raw document  ",
      isActive: false,
    });
    const contractOptions = rentalQueryOptions.contracts(api, "org-a", {
      keyword: "  contract  ",
      startDateFrom: "2026-09-01",
    });

    await client.fetchQuery(tenantOptions);
    await client.fetchQuery(contractOptions);

    expect(api.listTenants).toHaveBeenCalledWith(tenantOptions.queryKey[3]);
    expect(api.listContracts).toHaveBeenCalledWith(contractOptions.queryKey[3]);
    expect(tenantOptions.queryKey[3]).toEqual({
      keyword: "tenant",
      isActive: false,
      documentNumber: "  raw document  ",
      page: 1,
      pageSize: 20,
    });
    expect(contractOptions.queryKey[3]).toEqual({
      keyword: "contract",
      startDateFrom: "2026-09-01",
      page: 1,
      pageSize: 20,
    });
  });

  it("does not execute rental queries without an explicit organization", async () => {
    const api = createApi();
    const options = rentalQueryOptions.tenants(api, "", { page: 1, pageSize: 20 });

    expect(options.enabled).toBe(false);
    expect(api.listTenants).not.toHaveBeenCalled();
  });

  it("invalidates tenant mutations according to their contract impact and removes deleted details", async () => {
    const client = new QueryClient();
    const organizationId = "org-a";
    const tenantId = "tenant-1";
    const tenantList = rentalKeys.tenants(organizationId, { page: 1, pageSize: 20 });
    const tenantDetail = rentalKeys.tenant(organizationId, tenantId);
    const contracts = rentalKeys.contractsRoot(organizationId);
    for (const key of [tenantList, tenantDetail, contracts]) client.setQueryData(key, []);

    await invalidateTenantMutation(client, organizationId, tenantId, "update");
    expect(client.getQueryState(tenantList)?.isInvalidated).toBe(true);
    expect(client.getQueryState(tenantDetail)?.isInvalidated).toBe(true);
    expect(client.getQueryState(contracts)?.isInvalidated).toBe(true);

    client.getQueryCache().clear();
    for (const key of [tenantList, tenantDetail, contracts]) client.setQueryData(key, []);
    await invalidateDeletedTenantMutation(client, organizationId, tenantId);
    expect(client.getQueryState(tenantList)?.isInvalidated).toBe(true);
    expect(client.getQueryState(contracts)?.isInvalidated).toBe(true);
    expect(client.getQueryState(tenantDetail)).toBeUndefined();
  });

  it("invalidates contract and affected property scopes, including both sides of a property move", async () => {
    const client = new QueryClient();
    const organizationId = "org-a";
    const contractId = "contract-1";
    const properties = ["property-old", "property-new"];
    const keys = [
      rentalKeys.contractsRoot(organizationId),
      rentalKeys.contract(organizationId, contractId),
      ...properties.flatMap((propertyId) => [
        rentalKeys.spacesRoot(organizationId, propertyId),
        rentalKeys.property(organizationId, propertyId),
        rentalKeys.childrenRoot(organizationId, propertyId),
        rentalKeys.searchRoot(organizationId, propertyId),
      ]),
    ];
    for (const key of keys) client.setQueryData(key, []);

    await invalidateContractMutation(client, organizationId, contractId, properties);

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("removes deleted contract detail while refreshing its contract and property scopes", async () => {
    const client = new QueryClient();
    const organizationId = "org-a";
    const contractId = "contract-1";
    const contract = rentalKeys.contract(organizationId, contractId);
    const contracts = rentalKeys.contractsRoot(organizationId);
    const property = rentalKeys.property(organizationId, "property-1");
    const spaces = rentalKeys.spacesRoot(organizationId, "property-1");
    for (const key of [contract, contracts, property, spaces]) client.setQueryData(key, []);

    await invalidateDeletedContractMutation(client, organizationId, contractId, ["property-1"]);

    expect(client.getQueryState(contract)).toBeUndefined();
    expect(client.getQueryState(contracts)?.isInvalidated).toBe(true);
    expect(client.getQueryState(property)?.isInvalidated).toBe(true);
    expect(client.getQueryState(spaces)?.isInvalidated).toBe(true);
  });

  it("does not create availability or reveal query cache entries", async () => {
    const api = createApi();
    const client = new QueryClient();

    await api.checkContractAvailability?.({
      propertyId: "property-1",
      spaceIds: ["space-1"],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    await api.revealTenantSensitive?.({ id: "tenant-1" });
    await api.revealContractPartySensitive?.({
      contractId: "contract-1",
      tenantId: "tenant-1",
      validFrom: "2026-09-01",
    });

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("drops late reveal values after abort, close, unmount, or organization switch", async () => {
    const deferred = <T>() => {
      let resolve: (value: T) => void = () => undefined;
      const promise = new Promise<T>((nextResolve) => {
        resolve = nextResolve;
      });
      return { promise, resolve };
    };
    const reveal = createEphemeralRentalReveal<string>();

    const aborted = deferred<string>();
    const abortedRequest = reveal.reveal(() => aborted.promise);
    reveal.abort();
    aborted.resolve("late-abort");
    await expect(abortedRequest).resolves.toBeUndefined();
    expect(reveal.value).toBeUndefined();

    const closed = deferred<string>();
    const closedRequest = reveal.reveal(() => closed.promise);
    reveal.close();
    closed.resolve("late-close");
    await expect(closedRequest).resolves.toBeUndefined();
    expect(reveal.value).toBeUndefined();

    const unmounted = deferred<string>();
    const unmountedRequest = reveal.reveal(() => unmounted.promise);
    reveal.unmount();
    unmounted.resolve("late-unmount");
    await expect(unmountedRequest).resolves.toBeUndefined();
    expect(reveal.value).toBeUndefined();

    reveal.reopen();
    const switched = deferred<string>();
    const switchedRequest = reveal.reveal(() => switched.promise);
    reveal.switchOrganization();
    switched.resolve("late-switch");
    await expect(switchedRequest).resolves.toBeUndefined();
    expect(reveal.value).toBeUndefined();
  });

  it("clears only the requested organization boundary when one is supplied", () => {
    const client = new QueryClient();
    const orgA = rentalKeys.tenants("org-a", { page: 1, pageSize: 20 });
    const orgB = rentalKeys.tenants("org-b", { page: 1, pageSize: 20 });
    client.setQueryData(orgA, []);
    client.setQueryData(orgB, []);

    clearRentalQueries(client, "org-a");

    expect(client.getQueryState(orgA)).toBeUndefined();
    expect(client.getQueryState(orgB)).toBeDefined();
  });
});
