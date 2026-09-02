import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env.schema.js";

const validRequiredEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/xpense",
  JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
  WEB_ORIGIN: "http://localhost:5173",
  RENTAL_PII_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  RENTAL_PII_LOOKUP_KEY: "ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=",
};

describe("parseServerEnv", () => {
  it("returns typed configuration for valid environment values", () => {
    const env = parseServerEnv({
      ...validRequiredEnv,
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_DAYS: "30",
      BOOTSTRAP_SUPER_ADMIN_EMAIL: "root@example.com",
      BOOTSTRAP_SUPER_ADMIN_PHONE: "13800138000",
      BOOTSTRAP_SUPER_ADMIN_PASSWORD: "strong-password",
      BOOTSTRAP_ORGANIZATION_NAME: "Xpense",
    });

    expect(env.DATABASE_URL).toBe(validRequiredEnv.DATABASE_URL);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.WEB_ORIGIN).toBe("http://localhost:5173");
    expect(env.BOOTSTRAP_SUPER_ADMIN_EMAIL).toBe("root@example.com");
    expect(env.BOOTSTRAP_SUPER_ADMIN_PHONE).toBe("13800138000");
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

  it("requires distinct 32-byte Base64 rental PII keys", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: validRequiredEnv.DATABASE_URL,
        JWT_ACCESS_SECRET: validRequiredEnv.JWT_ACCESS_SECRET,
        WEB_ORIGIN: validRequiredEnv.WEB_ORIGIN,
      }),
    ).toThrow(/RENTAL_PII_ENCRYPTION_KEY/);

    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        RENTAL_PII_ENCRYPTION_KEY: "not-base64",
      }),
    ).toThrow(/RENTAL_PII_ENCRYPTION_KEY/);

    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        RENTAL_PII_LOOKUP_KEY: "YQ==",
      }),
    ).toThrow(/RENTAL_PII_LOOKUP_KEY/);

    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        RENTAL_PII_LOOKUP_KEY: validRequiredEnv.RENTAL_PII_ENCRYPTION_KEY,
      }),
    ).toThrow(/must be different/);
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
    expect(env.VITE_API_PREFIX).toBe("api");
    expect(env.CAPTCHA_TTL_SECONDS).toBe(60);
    expect(env.LOGIN_RATE_LIMIT_IP_MAX).toBe(10);
    expect(env.LOGIN_RATE_LIMIT_PHONE_MAX).toBe(5);
    expect(env.LOGIN_RATE_LIMIT_WINDOW_SECONDS).toBe(300);
  });

  it("accepts a custom API prefix path segment", () => {
    const env = parseServerEnv({
      ...validRequiredEnv,
      VITE_API_PREFIX: "v2",
    });

    expect(env.VITE_API_PREFIX).toBe("v2");
  });

  it.each(["/api", "api/", ""])("rejects invalid API prefix %j", (VITE_API_PREFIX) => {
    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        VITE_API_PREFIX,
      }),
    ).toThrow(/VITE_API_PREFIX/);
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

  it("rejects a bootstrap phone in an invalid format", () => {
    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        BOOTSTRAP_SUPER_ADMIN_EMAIL: "root@example.com",
        BOOTSTRAP_SUPER_ADMIN_PHONE: "12345",
        BOOTSTRAP_SUPER_ADMIN_PASSWORD: "strong-password",
        BOOTSTRAP_ORGANIZATION_NAME: "Xpense",
      }),
    ).toThrow(/BOOTSTRAP_SUPER_ADMIN_PHONE/);
  });

  it("requires a bootstrap phone when other bootstrap values are present", () => {
    expect(() =>
      parseServerEnv({
        ...validRequiredEnv,
        BOOTSTRAP_SUPER_ADMIN_EMAIL: "root@example.com",
        BOOTSTRAP_SUPER_ADMIN_PASSWORD: "strong-password",
        BOOTSTRAP_ORGANIZATION_NAME: "Xpense",
      }),
    ).toThrow(/BOOTSTRAP_SUPER_ADMIN_PHONE/);
  });
});
