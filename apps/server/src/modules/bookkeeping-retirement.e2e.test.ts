import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "../test/create-test-app.js";

describe("已移除的独立记账 API", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ rental: true }));
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    "/accounts/list",
    "/categories/list",
    "/transactions/list",
    "/transactions/detail",
    "/ledgers/list",
    "/statistics/monthly",
  ])("不再注册查询接口 %s", async (path) => {
    const response = await app.inject({ method: "GET", url: `/api${path}` });
    expect(response.statusCode).toBe(404);
  });

  it.each(["accounts", "categories", "transactions"])("不再注册 %s 写接口", async (resource) => {
    for (const action of ["create", "update", "delete"]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/${resource}/${action}`,
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    }
  });
});
