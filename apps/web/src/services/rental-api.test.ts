import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "./api-client";
import { createRentalApi } from "./rental-api";

describe("createRentalApi", () => {
  function createHarness() {
    const client = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
    };

    return { api: createRentalApi(client as unknown as ApiClient), client };
  }

  it("serializes property filters in server DTO order and encodes free text", async () => {
    const { api, client } = createHarness();

    await api.listProperties({
      keyword: "南山 / 公寓",
      type: "apartment_building",
      isActive: false,
      province: "广东",
      city: "深圳",
      district: "南山",
      page: 2,
      pageSize: 50,
    });

    expect(client.get).toHaveBeenCalledWith(
      "/rental-properties/list?keyword=%E5%8D%97%E5%B1%B1+%2F+%E5%85%AC%E5%AF%93&type=apartment_building&isActive=false&province=%E5%B9%BF%E4%B8%9C&city=%E6%B7%B1%E5%9C%B3&district=%E5%8D%97%E5%B1%B1&page=2&pageSize=50",
    );
  });

  it("keeps nullable parents out of child URLs and sends space commands to their exact endpoints", async () => {
    const { api, client } = createHarness();
    const createInput = {
      propertyId: "property-1",
      name: "101",
      type: "room" as const,
      isRentable: true,
    };

    await api.listChildren({ propertyId: "p1", parentId: null, page: 1, pageSize: 50 });
    await api.searchSpaces({ propertyId: "p1", keyword: "  101 / A  ", page: 2, pageSize: 20 });
    await api.getSpaceSubtreeDepth({ propertyId: "p1", id: "space-1" });
    await api.createSpace(createInput);
    await api.moveSpace("space-1", { parentId: null, sortOrder: 10 });
    await api.deleteSpace("space-1");

    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/rental-spaces/children?propertyId=p1&page=1&pageSize=50",
    );
    expect(client.get).toHaveBeenNthCalledWith(
      2,
      "/rental-spaces/search?propertyId=p1&keyword=101+%2F+A&page=2&pageSize=20",
    );
    expect(client.get).toHaveBeenNthCalledWith(
      3,
      "/rental-spaces/subtree-depth?propertyId=p1&id=space-1",
    );
    expect(client.post).toHaveBeenNthCalledWith(1, "/rental-spaces/create", createInput);
    expect(client.post).toHaveBeenNthCalledWith(2, "/rental-spaces/move", {
      id: "space-1",
      parentId: null,
      sortOrder: 10,
    });
    expect(client.post).toHaveBeenNthCalledWith(3, "/rental-spaces/delete", { id: "space-1" });
  });

  it("serializes tenant list/detail requests and preserves the server-facing document input", async () => {
    const { api, client } = createHarness();

    await api.listTenants({
      keyword: "  租户 / A  ",
      type: "individual",
      isActive: false,
      documentCountryCode: "CN",
      documentType: "national_id",
      documentNumber: "  CN 123  ",
      page: 2,
      pageSize: 50,
    });
    await api.tenantDetail("tenant/1");

    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/rental-tenants/list?keyword=%E7%A7%9F%E6%88%B7+%2F+A&type=individual&isActive=false&documentCountryCode=CN&documentType=national_id&documentNumber=++CN+123++&page=2&pageSize=50",
    );
    expect(client.get).toHaveBeenNthCalledWith(2, "/rental-tenants/detail?id=tenant%2F1");
  });

  it("sends every tenant mutation to its exact endpoint and returns the response unchanged", async () => {
    const response = { id: "tenant-1", name: "result" };
    const { api, client } = createHarness();
    client.post.mockResolvedValue(response);
    const createInput = {
      type: "individual" as const,
      name: "租户",
      phone: null,
      documentNumber: null,
    };
    const updateInput = { id: "tenant-1", note: null };
    const statusInput = { id: "tenant-1", isActive: false };

    await expect(api.createTenant(createInput)).resolves.toBe(response);
    await expect(api.updateTenant(updateInput)).resolves.toBe(response);
    await expect(api.setTenantStatus(statusInput)).resolves.toBe(response);
    await expect(api.deleteTenant("tenant-1")).resolves.toBe(response);
    await expect(api.revealTenantSensitive({ id: "tenant-1" })).resolves.toBe(response);

    expect(client.post).toHaveBeenNthCalledWith(1, "/rental-tenants/create", createInput);
    expect(client.post).toHaveBeenNthCalledWith(2, "/rental-tenants/update", updateInput);
    expect(client.post).toHaveBeenNthCalledWith(3, "/rental-tenants/set-status", statusInput);
    expect(client.post).toHaveBeenNthCalledWith(4, "/rental-tenants/delete", { id: "tenant-1" });
    expect(client.post).toHaveBeenNthCalledWith(5, "/rental-tenants/reveal-sensitive", {
      id: "tenant-1",
    });
  });

  it("serializes contract list/detail requests in DTO order without changing local dates", async () => {
    const { api, client } = createHarness();

    await api.listContracts({
      keyword: "  contract / A  ",
      propertyId: "property-1",
      tenantId: "tenant-1",
      status: "active",
      startDateFrom: "2026-09-01",
      startDateTo: "2026-09-30",
      endDateFrom: "2027-01-01",
      endDateTo: "2027-01-31",
      page: 3,
      pageSize: 20,
    });
    await api.contractDetail("contract/1");

    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/rental-contracts/list?keyword=contract+%2F+A&propertyId=property-1&tenantId=tenant-1&status=active&startDateFrom=2026-09-01&startDateTo=2026-09-30&endDateFrom=2027-01-01&endDateTo=2027-01-31&page=3&pageSize=20",
    );
    expect(client.get).toHaveBeenNthCalledWith(2, "/rental-contracts/detail?id=contract%2F1");
  });

  it("sends contract create, availability, lifecycle, delete, and reveal bodies unchanged", async () => {
    const response = { id: "contract-1", rentAmountMinor: 12345 };
    const { api, client } = createHarness();
    client.post.mockResolvedValue(response);
    const createInput = {
      propertyId: "property-1",
      rentAmountMinor: 12345,
      parties: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
      spaces: [{ spaceId: "space-1", rentAllocationMinor: 12345 }],
      depositTerms: [
        {
          type: "rental" as const,
          calculationMode: "rent_multiple" as const,
          rentMultiple: "2.5",
        },
      ],
      note: null,
    };
    const updateInput = { id: "contract-1", note: null };
    const availabilityInput = {
      propertyId: "property-1",
      spaceIds: ["space-1", "space-2"],
      startDate: "2026-09-01",
      endDate: "2027-08-31",
    };
    const actionInputs = {
      confirm: { id: "contract-1" },
      cancel: { id: "contract-1", reason: "cancel" },
      changeParties: {
        id: "contract-1",
        effectiveDate: "2026-10-01",
        reason: "change",
        parties: [{ tenantId: "tenant-2", isPrimaryPayer: true }],
      },
      terminate: { id: "contract-1", terminationDate: "2027-01-01", reason: "end" },
      revokeTermination: { id: "contract-1", reason: "revoke" },
      renew: { id: "contract-1" },
      delete: { id: "contract-1" },
    };

    await expect(api.createContract(createInput)).resolves.toBe(response);
    await expect(api.updateContract(updateInput)).resolves.toBe(response);
    await expect(api.checkContractAvailability(availabilityInput)).resolves.toBe(response);
    await expect(api.confirmContract(actionInputs.confirm)).resolves.toBe(response);
    await expect(api.cancelContract(actionInputs.cancel)).resolves.toBe(response);
    await expect(api.changeContractParties(actionInputs.changeParties)).resolves.toBe(response);
    await expect(api.terminateContract(actionInputs.terminate)).resolves.toBe(response);
    await expect(api.revokeContractTermination(actionInputs.revokeTermination)).resolves.toBe(
      response,
    );
    await expect(api.renewContract(actionInputs.renew)).resolves.toBe(response);
    await expect(api.deleteContract(actionInputs.delete)).resolves.toBe(response);
    await expect(
      api.revealContractPartySensitive({
        contractId: "contract-1",
        tenantId: "tenant-2",
        validFrom: "2026-09-01",
      }),
    ).resolves.toBe(response);

    expect(client.post).toHaveBeenNthCalledWith(1, "/rental-contracts/create", createInput);
    expect(client.post).toHaveBeenNthCalledWith(2, "/rental-contracts/update", updateInput);
    expect(client.post).toHaveBeenNthCalledWith(
      3,
      "/rental-contracts/check-availability",
      availabilityInput,
    );
    expect(client.post).toHaveBeenNthCalledWith(
      4,
      "/rental-contracts/confirm",
      actionInputs.confirm,
    );
    expect(client.post).toHaveBeenNthCalledWith(5, "/rental-contracts/cancel", actionInputs.cancel);
    expect(client.post).toHaveBeenNthCalledWith(
      6,
      "/rental-contracts/change-parties",
      actionInputs.changeParties,
    );
    expect(client.post).toHaveBeenNthCalledWith(
      7,
      "/rental-contracts/terminate",
      actionInputs.terminate,
    );
    expect(client.post).toHaveBeenNthCalledWith(
      8,
      "/rental-contracts/revoke-termination",
      actionInputs.revokeTermination,
    );
    expect(client.post).toHaveBeenNthCalledWith(9, "/rental-contracts/renew", actionInputs.renew);
    expect(client.post).toHaveBeenNthCalledWith(
      10,
      "/rental-contracts/delete",
      actionInputs.delete,
    );
    expect(client.post).toHaveBeenNthCalledWith(11, "/rental-contracts/reveal-sensitive", {
      contractId: "contract-1",
      tenantId: "tenant-2",
      validFrom: "2026-09-01",
    });
    expect(
      client.post.mock.calls.some(([path]) => path === "/rental-contracts/reveal-party-sensitive"),
    ).toBe(false);
  });

  it("forwards an abort signal for sensitive reveal without creating a query cache", async () => {
    const { api, client } = createHarness();
    const controller = new AbortController();

    await api.revealTenantSensitive({ id: "tenant-1" }, { signal: controller.signal });
    await api.revealContractPartySensitive(
      { contractId: "contract-1", tenantId: "tenant-1", validFrom: "2026-09-01" },
      { signal: controller.signal },
    );

    expect(client.post).toHaveBeenNthCalledWith(
      1,
      "/rental-tenants/reveal-sensitive",
      { id: "tenant-1" },
      { signal: controller.signal },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      "/rental-contracts/reveal-sensitive",
      { contractId: "contract-1", tenantId: "tenant-1", validFrom: "2026-09-01" },
      { signal: controller.signal },
    );
  });
});
