import { afterEach, describe, expect, it, vi } from "vitest";

import { CaptchaService } from "./captcha.service.js";

vi.mock("svg-captcha", () => ({
  create: () => ({ text: "aBcD", data: "<svg>mock</svg>" }),
}));

const secret = "test-secret-with-at-least-thirty-two-characters";

function createService(ttlSeconds = 60): CaptchaService {
  return new CaptchaService({
    env: { JWT_ACCESS_SECRET: secret, CAPTCHA_TTL_SECONDS: ttlSeconds },
  } as never);
}

describe("CaptchaService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("issues a captcha whose id verifies against the rendered answer", () => {
    const service = createService();
    const { captchaId, svg } = service.issue();

    expect(svg).toBe("<svg>mock</svg>");
    expect(service.verify(captchaId, "abcd")).toBe(true);
  });

  it("verifies captcha text case-insensitively", () => {
    const service = createService();
    const { captchaId } = service.issue();

    expect(service.verify(captchaId, "ABCD")).toBe(true);
    expect(service.verify(captchaId, "AbCd")).toBe(true);
  });

  it("rejects a wrong answer", () => {
    const service = createService();
    const { captchaId } = service.issue();

    expect(service.verify(captchaId, "wrong")).toBe(false);
  });

  it("rejects a tampered captcha id", () => {
    const service = createService();
    const { captchaId } = service.issue();

    expect(service.verify(`${captchaId}x`, "abcd")).toBe(false);
    expect(service.verify("not-a-captcha", "abcd")).toBe(false);
  });

  it("rejects an expired captcha", () => {
    vi.useFakeTimers();
    const base = new Date("2026-07-06T00:00:00.000Z");
    vi.setSystemTime(base);

    const service = createService(60);
    const { captchaId } = service.issue();

    vi.setSystemTime(new Date(base.getTime() + 61_000));

    expect(service.verify(captchaId, "abcd")).toBe(false);
  });

  it("rejects a captcha issued with a different secret", () => {
    const service = createService();
    const { captchaId } = service.issue();
    const otherService = new CaptchaService({
      env: {
        JWT_ACCESS_SECRET: "another-secret-with-at-least-thirty-two-characters",
        CAPTCHA_TTL_SECONDS: 60,
      },
    } as never);

    expect(otherService.verify(captchaId, "abcd")).toBe(false);
  });
});
