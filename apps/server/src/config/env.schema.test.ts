import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env.schema.js";

const validRequiredEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/xpense",
  JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
  WEB_ORIGIN: "http://localhost:5173",
};

describe("parseServerEnv", () => {
  it("returns typed configuration for valid environment values", () => {
    const env = parseServerEnv({
      ...validRequiredEnv,
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_DAYS: "30",
      BOOTSTRAP_SUPER_ADMIN_EMAIL: "root@example.com",
      BOOTSTRAP_SUPER_ADMIN_PASSWORD: "strong-password",
      BOOTSTRAP_ORGANIZATION_NAME: "Xpense",
    });

    expect(env.DATABASE_URL).toBe(validRequiredEnv.DATABASE_URL);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.WEB_ORIGIN).toBe("http://localhost:5173");
    expect(env.BOOTSTRAP_SUPER_ADMIN_EMAIL).toBe("root@example.com");
    expect(env.BOOTSTRAP_SUPER_ADMIN_PASSWORD).toBe("strong-password");
    expect(env.BOOTSTRAP_ORGANIZATION_NAME).toBe("Xpense");
  });

  it("rejects missing database url", () => {
    expect(() =>
      parseServerEnv({
        JWT_ACCESS_SECRET: validRequiredEnv.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects missing web origin", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: validRequiredEnv.DATABASE_URL,
        JWT_ACCESS_SECRET: validRequiredEnv.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it("rejects database urls with non-postgresql protocols", () => {
    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        DATABASE_URL: "https://example.com",
      }),
    ).toThrow(/DATABASE_URL|PostgreSQL/);
  });

  it("rejects malformed database urls without throwing native type errors", () => {
    try {
      parseServerEnv({
        ...validRequiredEnv,
        DATABASE_URL: "not-url",
      });

      throw new Error("Expected parseServerEnv to reject malformed DATABASE_URL");
    } catch (error) {
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/DATABASE_URL|Invalid url/);
    }
  });

  it("rejects short jwt access secrets", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: validRequiredEnv.DATABASE_URL,
        JWT_ACCESS_SECRET: "short-secret",
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("uses the confirmed defaults when optional values are omitted", () => {
    const env = parseServerEnv(validRequiredEnv);

    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.WEB_ORIGIN).toBe(validRequiredEnv.WEB_ORIGIN);
    expect(env.WEB_REFRESH_TOKEN_COOKIE).toBe("xpense_refresh_token");
    expect(env.APP_REFRESH_TOKEN_TRANSPORT).toBe("json_body");
    expect(env.SYSTEM_ROLES).toEqual(["owner", "admin", "member", "viewer"]);
    expect(env.BOOTSTRAP_SOURCE).toBe("environment_variables");
    expect(env.PASSWORD_HASH).toBe("argon2id");
    expect(env.ACCESS_TOKEN).toBe("jwt");
    expect(env.REFRESH_TOKEN).toBe("opaque_random_hash_at_rest");
  });

  it("rejects invalid ttl values", () => {
    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        ACCESS_TOKEN_TTL_SECONDS: "0",
      }),
    ).toThrow(/ACCESS_TOKEN_TTL_SECONDS/);

    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        REFRESH_TOKEN_TTL_DAYS: "1.5",
      }),
    ).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
  });

  it("rejects changed system roles ordering or extra roles", () => {
    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        SYSTEM_ROLES: "admin,owner,member,viewer",
      }),
    ).toThrow(/SYSTEM_ROLES/);

    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        SYSTEM_ROLES: "owner,admin,member,viewer,auditor",
      }),
    ).toThrow(/SYSTEM_ROLES/);
  });

  it("rejects changes to confirmed literal configuration values", () => {
    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        APP_REFRESH_TOKEN_TRANSPORT: "cookie",
      }),
    ).toThrow(/APP_REFRESH_TOKEN_TRANSPORT/);

    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        ACCESS_TOKEN: "opaque",
      }),
    ).toThrow(/ACCESS_TOKEN/);
  });

  it("rejects incomplete bootstrap environment values", () => {
    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        BOOTSTRAP_SUPER_ADMIN_EMAIL: "root@example.com",
      }),
    ).toThrow(/BOOTSTRAP_SUPER_ADMIN_PASSWORD/);
  });
});
