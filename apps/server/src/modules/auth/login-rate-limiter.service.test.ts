import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { LoginRateLimiterService } from "./login-rate-limiter.service.js";
import { InMemoryRateLimitStore } from "./rate-limit-store.js";

describe("InMemoryRateLimitStore", () => {
  it("counts only failures inside the sliding window", () => {
    const store = new InMemoryRateLimitStore(300);
    const base = 1_000_000;

    store.record("ip:1.2.3.4", base);
    store.record("ip:1.2.3.4", base + 1_000);
    expect(store.count("ip:1.2.3.4", base + 2_000)).toBe(2);

    expect(store.count("ip:1.2.3.4", base + 301_000)).toBe(0);
  });

  it("isolates keys and supports reset", () => {
    const store = new InMemoryRateLimitStore(300);
    const base = 1_000_000;

    store.record("phone:13800000001", base);
    store.record("phone:13800000002", base);
    expect(store.count("phone:13800000001", base + 1_000)).toBe(1);

    store.reset("phone:13800000001");
    expect(store.count("phone:13800000001", base + 1_000)).toBe(0);
    expect(store.count("phone:13800000002", base + 1_000)).toBe(1);
  });
});

describe("LoginRateLimiterService", () => {
  function createHarness(ipMax = 10, phoneMax = 5) {
    const store = {
      record: vi.fn(),
      count: vi.fn().mockReturnValue(0),
      reset: vi.fn(),
    };
    const config = {
      env: {
        LOGIN_RATE_LIMIT_IP_MAX: ipMax,
        LOGIN_RATE_LIMIT_PHONE_MAX: phoneMax,
      },
    };
    const service = new LoginRateLimiterService(store as never, config as never);

    return { service, store };
  }

  it("rejects with 429 when the IP limit is reached", () => {
    const { service, store } = createHarness();
    store.count.mockImplementation((key: string) => (key === "ip:1.2.3.4" ? 10 : 0));

    try {
      service.assertAllowed("1.2.3.4", "13800000001");
      throw new Error("expected assertAllowed to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
    }
  });

  it("rejects with 429 when the phone limit is reached", () => {
    const { service, store } = createHarness();
    store.count.mockImplementation((key: string) => (key === "phone:13800000001" ? 5 : 0));

    expect(() => service.assertAllowed(undefined, "13800000001")).toThrow(HttpException);
  });

  it("allows the attempt when both dimensions are under their limits", () => {
    const { service } = createHarness();

    expect(() => service.assertAllowed("1.2.3.4", "13800000001")).not.toThrow();
  });

  it("records failures for both IP and phone keys", () => {
    const { service, store } = createHarness();

    service.recordFailure("1.2.3.4", "13800000001");

    expect(store.record).toHaveBeenCalledWith("ip:1.2.3.4", expect.any(Number));
    expect(store.record).toHaveBeenCalledWith("phone:13800000001", expect.any(Number));
  });

  it("falls back to an unknown IP key when the IP is missing", () => {
    const { service, store } = createHarness();

    service.recordFailure(undefined, "13800000001");

    expect(store.record).toHaveBeenCalledWith("ip:unknown", expect.any(Number));
  });

  it("resets only the phone key after a successful login", () => {
    const { service, store } = createHarness();

    service.resetPhone("13800000001");

    expect(store.reset).toHaveBeenCalledWith("phone:13800000001");
  });
});
