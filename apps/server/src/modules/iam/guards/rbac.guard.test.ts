import { type ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../../common/auth/auth-context.js";
import {
  REQUIRE_PERMISSION_KEY,
  RequirePermission,
} from "../decorators/require-permission.decorator.js";
import { AuthGuard } from "./auth.guard.js";
import { RbacGuard } from "./rbac.guard.js";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-1",
  isSuperAdmin: false,
  permissions: ["roles:update"],
};

type RequestLike = {
  headers: Record<string, string | undefined>;
  authContext?: AuthContext;
};

function createContext(request: RequestLike, handler: () => unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => Object,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  function createHarness() {
    const request: RequestLike = {
      headers: {
        authorization: "Bearer access-token",
      },
    };
    const tokenService = {
      verifyAccessToken: vi.fn().mockResolvedValue({
        userId: "user-1",
        sessionId: "session-1",
        organizationId: "org-1",
      }),
    };
    const accessService = {
      resolveAuthContext: vi.fn().mockResolvedValue(authContext),
    };
    const guard = new AuthGuard(tokenService as never, accessService as never);

    return { accessService, guard, request, tokenService };
  }

  it("stores auth context from a valid bearer access token", async () => {
    const { accessService, guard, request, tokenService } = createHarness();

    await expect(guard.canActivate(createContext(request, () => undefined))).resolves.toBe(true);

    expect(tokenService.verifyAccessToken).toHaveBeenCalledWith("access-token");
    expect(accessService.resolveAuthContext).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-1",
    });
    expect(request.authContext).toEqual(authContext);
  });

  it("rejects missing bearer access token", async () => {
    const { guard, request } = createHarness();
    request.headers.authorization = undefined;

    await expect(guard.canActivate(createContext(request, () => undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects invalid access token", async () => {
    const { guard, request, tokenService } = createHarness();
    tokenService.verifyAccessToken.mockRejectedValue(new Error("bad token"));

    await expect(guard.canActivate(createContext(request, () => undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe("RbacGuard", () => {
  class TestController {
    @RequirePermission("roles:update")
    updateRole() {
      return "ok";
    }

    readProfile() {
      return "ok";
    }
  }

  function createHarness(handler: () => unknown) {
    const request: RequestLike = {
      headers: {},
      authContext,
    };
    const accessService = {
      assertPermission: vi.fn(),
    };
    const guard = new RbacGuard(new Reflector(), accessService as never);

    return { accessService, guard, request, context: createContext(request, handler) };
  }

  it("requires authenticated context even when no permission metadata exists", () => {
    const { guard, request, context } = createHarness(TestController.prototype.readProfile);
    request.authContext = undefined;

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("allows authenticated routes without permission metadata", () => {
    const { accessService, guard, context } = createHarness(TestController.prototype.readProfile);

    expect(guard.canActivate(context)).toBe(true);
    expect(accessService.assertPermission).not.toHaveBeenCalled();
  });

  it("asserts required permission metadata", () => {
    const { accessService, guard, context } = createHarness(TestController.prototype.updateRole);

    expect(guard.canActivate(context)).toBe(true);
    expect(accessService.assertPermission).toHaveBeenCalledWith(authContext, "roles:update");
  });

  it("propagates forbidden permission decisions", () => {
    const { accessService, guard, context } = createHarness(TestController.prototype.updateRole);
    accessService.assertPermission.mockImplementation(() => {
      throw new ForbiddenException("missing permission");
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("uses RequirePermission metadata key", () => {
    const reflector = new Reflector();

    expect(reflector.get(REQUIRE_PERMISSION_KEY, TestController.prototype.updateRole)).toBe(
      "roles:update",
    );
  });
});
