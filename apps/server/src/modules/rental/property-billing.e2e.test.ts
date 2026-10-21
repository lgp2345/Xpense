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
  const unpaidBill = {
    bill: {
      id: "bill",
      billNumber: "RB-2026-000001",
      contractId: "contract",
      contractNumber: "C-001",
      propertyId: "00000000-0000-4000-8000-000000000001",
      propertyName: "房产",
      currencyCode: "CNY",
      type: "deposit",
      status: "active",
      sourceKey: "deposit:security",
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: "2026-10-01",
      amountMinor: 100_000,
      dueState: "date_passed",
      createdAt: "2026-09-01T00:00:00.000Z",
      revision: 1,
      financial: {
        receivedMinor: 40_000,
        refundedMinor: 0,
        netReceivedMinor: 40_000,
        outstandingMinor: 60_000,
        refundableMinor: 0,
        state: "partial",
        overdue: true,
      },
    },
    spaceId: "space",
    path: [{ id: "space", parentId: null, name: "101", sortOrder: 0 }],
    tenantNames: ["历史租户"],
  };
  const list = vi.fn().mockResolvedValue({
    property: { id: "00000000-0000-4000-8000-000000000001", name: "房产" },
    today: "2026-10-21",
    timezone: "Asia/Shanghai",
    items: [],
    unpaidBills: [unpaidBill],
    nextAfterContractId: null,
  });
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
  const response = await app.inject({ method: "GET", url, headers: { authorization: "ok" } });
  expect(response.statusCode).toBe(200);
  expect(response.json().data.unpaidBills).toEqual([unpaidBill]);
  list.mockRejectedValueOnce(new NotFoundException());
  expect(
    (await app.inject({ method: "GET", url, headers: { authorization: "ok" } })).statusCode,
  ).toBe(404);
  list.mockRejectedValueOnce(new Error("private database detail"));
  const failed = await app.inject({ method: "GET", url, headers: { authorization: "ok" } });
  expect(failed.statusCode).toBe(500);
  expect(failed.json()).toMatchObject({
    code: "INTERNAL_ERROR",
    message: "private database detail",
  });
});
