import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppModule } from "../app.module.js";
import { DB } from "../db/db.tokens.js";

const touchedEnvKeys = ["DATABASE_URL", "JWT_ACCESS_SECRET"] as const;
const originalTouchedEnv = Object.fromEntries(
  touchedEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof touchedEnvKeys)[number], string | undefined>;
const requiredTestEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/xpense",
  JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
};
const execute = vi.fn();

function restoreTouchedProcessEnv() {
  for (const key of touchedEnvKeys) {
    const originalValue = originalTouchedEnv[key];

    if (originalValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = originalValue;
  }
}

describe("Foundation API", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    restoreTouchedProcessEnv();
    Object.assign(process.env, requiredTestEnv);
    execute.mockReset().mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DB)
      .useValue({ execute })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
    restoreTouchedProcessEnv();
  });

  it("returns a stable health response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "server" });
  });

  it("returns database readiness when the query succeeds", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "server",
      database: "ready",
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("returns 503 without leaking database details", async () => {
    execute.mockRejectedValueOnce(new Error("connection refused for postgresql://secret"));

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      message: "Service is not ready",
      error: "Service Unavailable",
      statusCode: 503,
    });
    expect(response.body).not.toContain("connection refused");
    expect(response.body).not.toContain("postgresql://secret");
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
