import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../app.module.js";

describe("Foundation API", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns a stable health response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "server" });
  });

  it("returns the shared hello contract", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/foundation/hello",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      appName: "Xpense",
      message: "Hello from Xpense API",
    });
  });
});
