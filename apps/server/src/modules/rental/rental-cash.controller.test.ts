import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";

import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { rentalCashListQuerySchema } from "./dto/rental-cash.dto.js";
import { RentalCashController } from "./rental-cash.controller.js";

const billId = "00000000-0000-4000-8000-000000000001";

describe("RentalCashController", () => {
  it("exposes only an exact-target bounded list and delegates parsed query", async () => {
    const service = { list: vi.fn() };
    const controller = new RentalCashController(service as never);
    const auth = { organizationId: "org", userId: "user" };
    const query = rentalCashListQuerySchema.parse({
      kind: "bill",
      billId,
      page: "2",
      pageSize: "40",
    });

    await controller.list(auth as never, query);

    expect(query).toEqual({ target: { kind: "bill", billId }, page: 2, pageSize: 40 });
    expect(service.list).toHaveBeenCalledWith(auth, query);
    expect(Reflect.getMetadata(GUARDS_METADATA, RentalCashController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, RentalCashController)).toBe("rental-cash");
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, RentalCashController.prototype.list)).toBe(
      undefined,
    );
    expect(Reflect.getMetadata(PATH_METADATA, RentalCashController.prototype.list)).toBe("list");
    expect(Reflect.getMetadata(METHOD_METADATA, RentalCashController.prototype.list)).toBe(
      RequestMethod.GET,
    );
  });
});
