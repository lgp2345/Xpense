import {
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter.js";
import { TransformInterceptor } from "../../common/interceptors/transform.interceptor.js";
import { createValidationPipe } from "../../common/validation/create-validation-pipe.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { PropertyBillingController } from "./property-billing.controller.js";
import { PropertyBillingService } from "./property-billing.service.js";

let app: NestFastifyApplication;
afterEach(async () => {
  await app?.close();
});
it("HTTP 验证、认证、权限、404及读取失败统一映射", async () => {
  const list = vi.fn().mockResolvedValue({ items: [], nextAfterContractId: null });
  const module = await Test.createTestingModule({
    controllers: [PropertyBillingController],
    providers: [
      { provide: PropertyBillingService, useValue: { list } },
      { provide: APP_PIPE, useFactory: createValidationPipe },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
      { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    ],
  })
    .overrideGuard(AuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        if (!req.headers.authorization) throw new UnauthorizedException();
        req.authContext = { organizationId: "org" };
        return true;
      },
    })
    .overrideGuard(RbacGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        if (context.switchToHttp().getRequest().headers.authorization === "denied")
          throw new ForbiddenException();
        return true;
      },
    })
    .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const url = "/rental-period-bills/list?propertyId=00000000-0000-4000-8000-000000000001";
  expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  expect(
    (await app.inject({ method: "GET", url, headers: { authorization: "denied" } })).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/rental-period-bills/list?propertyId=bad",
        headers: { authorization: "ok" },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ method: "GET", url, headers: { authorization: "ok" } })).statusCode,
  ).toBe(200);
  list.mockRejectedValueOnce(new NotFoundException());
  expect(
    (await app.inject({ method: "GET", url, headers: { authorization: "ok" } })).statusCode,
  ).toBe(404);
  list.mockRejectedValueOnce(new Error("private database detail"));
  const failed = await app.inject({ method: "GET", url, headers: { authorization: "ok" } });
  expect(failed.statusCode).toBe(500);
  expect(failed.body).not.toContain("private database detail");
});
