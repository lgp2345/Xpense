import { afterEach, describe, expect, it } from "vitest";

import { ServerConfigService } from "./config.service.js";

const touchedEnvKeys = ["DATABASE_URL", "JWT_ACCESS_SECRET", "WEB_ORIGIN"] as const;
const originalTouchedEnv = Object.fromEntries(
  touchedEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof touchedEnvKeys)[number], string | undefined>;

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

describe("ServerConfigService", () => {
  afterEach(() => {
    restoreTouchedProcessEnv();
  });

  it("parses and caches process env during construction", () => {
    Object.assign(process.env, {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/xpense",
      JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
      WEB_ORIGIN: "http://localhost:5173",
    });

    const service = new ServerConfigService();

    expect(service.env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/xpense");
  });

  it("rejects missing required env during construction", () => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_ACCESS_SECRET;

    expect(() => new ServerConfigService()).toThrow(/DATABASE_URL/);
  });
});
