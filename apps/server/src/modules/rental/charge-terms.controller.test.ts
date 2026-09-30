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
import { ChargeTermsController } from "./charge-terms.controller.js";

describe("ChargeTermsController", () => {
  it("binds validated contract details and update DTOs with exact permissions and HTTP 200", async () => {
    const service = { detail: vi.fn(), update: vi.fn() };
    const controller = new ChargeTermsController(service as never);
    const auth = { organizationId: "org", userId: "user" };
    const detail = { id: "contract-1" };
    const update = { contractId: "contract-1", waterUnitPrice: "4" };

    await controller.detail(auth as never, detail as never);
    await controller.update(auth as never, update as never);

    expect(service.detail).toHaveBeenCalledWith(auth, { contractId: detail.id });
    expect(service.update).toHaveBeenCalledWith(auth, update);
    expect(Reflect.getMetadata(GUARDS_METADATA, ChargeTermsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, ChargeTermsController)).toBe("rental-charges");
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ChargeTermsController.prototype.detail),
    ).toEqual(["rental_contracts:read", "rental_charges:read"]);
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ChargeTermsController.prototype.update),
    ).toEqual(["rental_contracts:read", "rental_charges:update"]);
    expect(Reflect.getMetadata(PATH_METADATA, ChargeTermsController.prototype.update)).toBe(
      "update",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ChargeTermsController.prototype.update)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, ChargeTermsController.prototype.update)).toBe(
      200,
    );
  });
});
