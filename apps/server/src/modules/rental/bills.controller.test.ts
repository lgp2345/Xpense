import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { BillingLifecycleService } from "./billing-lifecycle.service.js";
import { BillsController } from "./bills.controller.js";
import { BillsService } from "./bills.service.js";
import { BillsReadService } from "./bills-read.service.js";
import { generateBillsSchema } from "./dto/generate-bills.dto.js";

describe("BillsController", () => {
  it("显式委托 schema 转换后的参数，并声明组合权限和 HTTP 200", async () => {
    const generate = vi.fn().mockResolvedValue({ createdCount: 6 });
    const module = await Test.createTestingModule({
      controllers: [BillsController],
      providers: [
        { provide: BillsService, useValue: { generate } },
        { provide: BillsReadService, useValue: {} },
        { provide: BillingLifecycleService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const dto = generateBillsSchema.parse({
      contractId: "00000000-0000-4000-8000-000000000001",
      depositDueDates: {},
      expectedVersion: "version",
      idempotencyKey: "00000000-0000-4000-8000-000000000002",
    });
    await module.get(BillsController).generate({} as never, dto);
    expect(generate).toHaveBeenCalledWith({}, dto);
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, BillsController.prototype.generate)).toEqual(
      ["rental_contracts:read", "rental_bills:read", "rental_bills:generate"],
    );
    expect(Reflect.getMetadata("__httpCode__", BillsController.prototype.generate)).toBe(200);
    await module.close();
  });
});
