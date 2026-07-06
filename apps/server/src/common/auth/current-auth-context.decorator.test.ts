import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
  UseGuards,
} from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthContext } from "./auth-context.js";
import { CurrentAuthContext } from "./current-auth-context.decorator.js";

const testAuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-1",
  isSuperAdmin: false,
  permissions: ["roles.update"],
} satisfies AuthContext;

type RequestWithAuthContext = {
  authContext?: AuthContext;
};

@Injectable()
class AttachAuthContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<RequestWithAuthContext>().authContext = testAuthContext;

    return true;
  }
}

@Controller()
class TestController {
  @Get("/auth-context")
  @UseGuards(AttachAuthContextGuard)
  getAuthContext(authContext: AuthContext): AuthContext {
    return authContext;
  }
}

CurrentAuthContext()(TestController.prototype, "getAuthContext", 0);

describe("CurrentAuthContext", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [AttachAuthContextGuard],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns the auth context attached to the request", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth-context",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(testAuthContext);
  });
});
