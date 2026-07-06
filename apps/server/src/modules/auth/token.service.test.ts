import { describe, expect, it } from "vitest";

import { TokenService } from "./token.service.js";

describe("TokenService", () => {
  function createService() {
    return new TokenService({
      env: {
        JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
        ACCESS_TOKEN_TTL_SECONDS: 900,
      },
    } as never);
  }

  it("signs and verifies access tokens", async () => {
    const service = createService();

    const token = await service.signAccessToken({
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-1",
    });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-1",
    });
  });

  it("creates opaque refresh tokens and hashes", async () => {
    const service = createService();

    const token = service.createRefreshToken();
    const hash = await service.hashRefreshToken(token);

    expect(token).not.toContain(".");
    await expect(service.verifyRefreshTokenHash(token, hash)).resolves.toBe(true);
    await expect(service.verifyRefreshTokenHash("different-token", hash)).resolves.toBe(false);
  });
});
