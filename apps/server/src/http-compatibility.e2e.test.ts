import { Body, Controller, Get, Module, Post, Req } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  afterAll(async () => {
    await app.close();
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
