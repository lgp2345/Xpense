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
import { confirmRentalRefundSchema, revokeRentalCashSchema } from "./dto/rental-cash.dto.js";
import { RentalRefundsController } from "./rental-refunds.controller.js";

const settlementId = "00000000-0000-4000-8000-000000000001";
const entryId = "00000000-0000-4000-8000-000000000002";
const idempotencyKey = "00000000-0000-4000-8000-000000000003";

describe("RentalRefundsController", () => {
  it("binds amount-free refund DTOs and exact action permissions", async () => {
    const service = { confirmRefund: vi.fn(), revokeRefund: vi.fn() };
    const controller = new RentalRefundsController(service as never);
    const auth = { organizationId: "org", userId: "user" };
    const refund = confirmRentalRefundSchema.parse({
      target: { kind: "settlement", settlementId },
      occurredOn: "2026-09-29",
      expectedVersion: "settlement-read-version",
      idempotencyKey,
    });
    const revoke = revokeRentalCashSchema.parse({
      entryId,
      reason: "退款金额录错",
      expectedVersion: "settlement-read-version",
      idempotencyKey,
    });

    await controller.create(auth as never, refund);
    await controller.revoke(auth as never, revoke);

    expect(service.confirmRefund).toHaveBeenCalledWith(auth, refund);
    expect(service.revokeRefund).toHaveBeenCalledWith(auth, revoke);
    expect(Reflect.getMetadata(GUARDS_METADATA, RentalRefundsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, RentalRefundsController)).toBe("rental-refunds");
    for (const [handler, path, permission] of [
      [RentalRefundsController.prototype.create, "create", "rental_refunds:create"],
      [RentalRefundsController.prototype.revoke, "revoke", "rental_refunds:revoke"],
    ] as const) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toBe(permission);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    }
  });
});
