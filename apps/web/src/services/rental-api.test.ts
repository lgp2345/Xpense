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
    expect(client.post).toHaveBeenNthCalledWith(1, "/rental-spaces/create", createInput);
    expect(client.post).toHaveBeenNthCalledWith(2, "/rental-spaces/move", {
      id: "space-1",
      parentId: null,
      sortOrder: 10,
    });
    expect(client.post).toHaveBeenNthCalledWith(3, "/rental-spaces/delete", { id: "space-1" });
  });
});
