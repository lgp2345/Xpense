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
import { MeterReadingsController } from "./meter-readings.controller.js";

describe("MeterReadingsController", () => {
  it("binds contract query and baseline update under the matching permissions", async () => {
    const service = { detail: vi.fn(), update: vi.fn() };
    const controller = new MeterReadingsController(service as never);
    const auth = { organizationId: "org", userId: "user" };
    const detail = { id: "contract-1" };
    const update = { contractId: "contract-1", readings: [] };

    await controller.detail(auth as never, detail as never);
    await controller.update(auth as never, update as never);

    expect(service.detail).toHaveBeenCalledWith(auth, { contractId: detail.id });
    expect(service.update).toHaveBeenCalledWith(auth, update);
    expect(Reflect.getMetadata(GUARDS_METADATA, MeterReadingsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, MeterReadingsController)).toBe("rental-meters");
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MeterReadingsController.prototype.detail),
    ).toEqual(["rental_contracts:read", "rental_meters:read"]);
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MeterReadingsController.prototype.update),
    ).toEqual(["rental_contracts:read", "rental_meters:update"]);
    expect(Reflect.getMetadata(PATH_METADATA, MeterReadingsController.prototype.update)).toBe(
      "update",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, MeterReadingsController.prototype.update)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, MeterReadingsController.prototype.update)).toBe(
      200,
    );
  });
});
