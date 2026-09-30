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
  confirmRentalDepositReceiptSchema,
  recordRentalReceiptSchema,
  revokeRentalCashSchema,
} from "./dto/rental-cash.dto.js";
import { RentalReceiptsController } from "./rental-receipts.controller.js";

const billId = "00000000-0000-4000-8000-000000000001";
const entryId = "00000000-0000-4000-8000-000000000002";
const idempotencyKey = "00000000-0000-4000-8000-000000000003";

describe("RentalReceiptsController", () => {
  it("binds the strict receipt DTOs, exact action permissions and action routes", async () => {
    const service = {
      recordReceipt: vi.fn(),
      confirmDepositReceipt: vi.fn(),
      revokeReceipt: vi.fn(),
    };
    const controller = new RentalReceiptsController(service as never);
    const auth = { organizationId: "org", userId: "user" };
    const receipt = recordRentalReceiptSchema.parse({
      target: { kind: "bill", billId },
      amountMinor: 200_000,
      occurredOn: "2026-09-29",
      expectedVersion: "bill-read-version",
      idempotencyKey,
    });
    const deposit = confirmRentalDepositReceiptSchema.parse({
      billId,
      occurredOn: "2026-09-29",
      expectedVersion: "deposit-read-version",
      idempotencyKey,
    });
    const revoke = revokeRentalCashSchema.parse({
      entryId,
      reason: "误登记",
      expectedVersion: "bill-read-version",
      idempotencyKey,
    });

    await controller.create(auth as never, receipt);
    await controller.confirmDeposit(auth as never, deposit);
    await controller.revoke(auth as never, revoke);

    expect(service.recordReceipt).toHaveBeenCalledWith(auth, receipt);
    expect(service.confirmDepositReceipt).toHaveBeenCalledWith(auth, deposit);
    expect(service.revokeReceipt).toHaveBeenCalledWith(auth, revoke);
    expect(Reflect.getMetadata(GUARDS_METADATA, RentalReceiptsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, RentalReceiptsController)).toBe("rental-receipts");
    const routes = [
      [RentalReceiptsController.prototype.create, "create", "rental_receipts:create"],
      [
        RentalReceiptsController.prototype.confirmDeposit,
        "confirm-deposit",
        "rental_receipts:create",
      ],
      [RentalReceiptsController.prototype.revoke, "revoke", "rental_receipts:revoke"],
    ] as const;
    for (const [handler, path, permission] of routes) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toBe(permission);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    }
  });
});
