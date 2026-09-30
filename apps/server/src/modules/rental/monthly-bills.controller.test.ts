import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";

import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import {
  generateRentalMonthlyBillSchema,
  previewRentalMonthlyBillSchema,
} from "./dto/rental-monthly-bills.dto.js";
import { MonthlyBillsController } from "./monthly-bills.controller.js";

const contractId = "00000000-0000-4000-8000-000000000001";
const idempotencyKey = "00000000-0000-4000-8000-000000000002";

describe("MonthlyBillsController", () => {
  it("binds strict preview/generate schemas and declares the three read/generate permissions", async () => {
    const service = { preview: vi.fn(), generate: vi.fn() };
    const controller = new MonthlyBillsController(service as never);
    const auth = { organizationId: "org", userId: "user" };
    const preview = previewRentalMonthlyBillSchema.parse({
      contractId,
      billingMonth: "2026-08",
      extraFees: [],
    });
    const generate = generateRentalMonthlyBillSchema.parse({
      contractId,
      billingMonth: "2026-08",
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "120" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
      ],
      extraFees: [],
      expectedVersion: "version",
      idempotencyKey,
    });

    await controller.preview(auth as never, preview);
    await controller.generate(auth as never, generate);

    expect(service.preview).toHaveBeenCalledWith(auth, preview);
    expect(service.generate).toHaveBeenCalledWith(auth, generate);
    expect(Reflect.getMetadata(GUARDS_METADATA, MonthlyBillsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, MonthlyBillsController)).toBe("rental-monthly-bills");
    for (const handler of [
      MonthlyBillsController.prototype.preview,
      MonthlyBillsController.prototype.generate,
    ]) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual([
        "rental_contracts:read",
        "rental_bills:read",
        "rental_monthly_bills:generate",
      ]);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    }
    expect(Reflect.getMetadata(PATH_METADATA, MonthlyBillsController.prototype.preview)).toBe(
      "preview",
    );
    expect(Reflect.getMetadata(PATH_METADATA, MonthlyBillsController.prototype.generate)).toBe(
      "generate",
    );
  });
});
