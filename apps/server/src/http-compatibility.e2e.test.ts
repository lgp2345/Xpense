import {
  Body,
  Controller,
  Get,
  Logger,
  Module,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor.js";
import { createValidationPipe } from "./common/validation/create-validation-pipe.js";
import { ServerConfigService } from "./config/config.service.js";
import { configureHttpApplication } from "./configure-http-application.js";

const compatibilityBodySchema = z.object({ name: z.string().trim().min(1) });

/** HTTP 兼容性测试专用控制器，用于隔离验证框架适配层。 */
@Controller("compatibility")
class HttpCompatibilityController {
  @Get("failure/:id")
  failure() {
    const cause = Object.assign(new Error("private SQL parameter"), { code: "ECONNREFUSED" });
    throw new Error("private bill details", { cause });
  }

  @Get("unavailable")
  unavailable() {
    throw new ServiceUnavailableException("private connection details");
  }

  @Post("body")
  body(@Body({ schema: compatibilityBodySchema }) value: z.output<typeof compatibilityBodySchema>) {
    return value;
  }

  @Get("cookies")
  cookies(@Req() request: { cookies: Record<string, string | undefined> }) {
    return request.cookies;
  }
}

@Module({
  controllers: [HttpCompatibilityController],
  providers: [
    { provide: ServerConfigService, useValue: { env: { WEB_ORIGIN: "http://localhost:5173" } } },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
class HttpCompatibilityModule {}

describe("NestJS 12 HTTP compatibility", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HttpCompatibilityModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("api");
    await configureHttpApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await app.close();
  });

  it("correlates safe exception details and completion logs with the response id", async () => {
    const errors = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const logs = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const response = await app.inject({
      method: "GET",
      url: "/api/compatibility/failure/private-path?note=private-query",
      headers: {
        "x-request-id": "req-failure",
        origin: "http://localhost:5173",
        authorization: "Bearer private-auth",
      },
    });
    expect(response.statusCode).toBe(500);
    expect(response.headers["x-request-id"]).toBe("req-failure");
    expect(response.headers["access-control-expose-headers"]).toContain("X-Request-Id");
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[0]).toMatchObject({
      event: "request.failed",
      requestId: "req-failure",
      method: "GET",
      route: "/api/compatibility/failure/:id",
      statusCode: 500,
      error: {
        type: "Error",
        stack: expect.stringContaining("http-compatibility.e2e.test.ts"),
        cause: { code: "ECONNREFUSED" },
      },
    });
    expect(logs.mock.calls.map(([entry]) => entry)).toContainEqual(
      expect.objectContaining({
        event: "request.completed",
        requestId: "req-failure",
        statusCode: 500,
        route: "/api/compatibility/failure/:id",
        durationMs: expect.any(Number),
      }),
    );
    const output = JSON.stringify([errors.mock.calls, logs.mock.calls, response.json()]);
    expect(output).not.toContain("private-");
    expect(output).not.toContain("private ");
  });

  it("logs explicit 503 exceptions safely and keeps concurrent ids separate", async () => {
    const errors = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const logs = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const [failure, success] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/api/compatibility/unavailable",
        headers: { "x-request-id": "req-503" },
      }),
      app.inject({
        method: "GET",
        url: "/api/compatibility/cookies",
        headers: { "x-request-id": "req-ok" },
      }),
    ]);
    expect(failure.json()).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "服务暂时不可用，请稍后重试",
      data: null,
    });
    expect(success.statusCode).toBe(200);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[0]).toMatchObject({ requestId: "req-503", statusCode: 503 });
    expect(logs.mock.calls.map(([entry]) => entry)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: "req-503", statusCode: 503 }),
        expect.objectContaining({ requestId: "req-ok", statusCode: 200 }),
      ]),
    );
  });

  it("keeps malformed JSON as a structured 400 response", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/compatibility/body",
      headers: { "content-type": "application/json" },
      payload: '{"name":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.any(String),
      data: null,
    });
  });

  it("keeps missing routes in the unified 404 response", async () => {
    const response = await app.inject({ method: "GET", url: "/api/missing" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "NOT_FOUND",
      message: "Cannot GET /api/missing",
      data: null,
    });
  });

  it("keeps credentialed CORS preflight behavior", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/compatibility/body",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("parses cookies and preserves the caller request id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/compatibility/cookies",
      headers: { cookie: "theme=dark; session=abc", "x-request-id": "compatibility-request" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe("compatibility-request");
    expect(response.json()).toEqual({
      code: "OK",
      message: "ok",
      data: { theme: "dark", session: "abc" },
    });
  });

  it("rejects prototype-related fields before values reach the controller", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/compatibility/body",
      headers: { "content-type": "application/json" },
      payload: '{"name":" Ada ","__proto__":{"polluted":true}}',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.any(String),
      data: null,
    });
    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
