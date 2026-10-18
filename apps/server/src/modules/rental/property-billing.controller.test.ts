import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { rentalPropertyBillingPermissions } from "@xpense/shared";
import { expect, it } from "vitest";
import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { PropertyBillingController } from "./property-billing.controller.js";

it("候选列表复用认证与全部权限", () => {
  expect(Reflect.getMetadata(GUARDS_METADATA, PropertyBillingController)).toEqual([
    AuthGuard,
    RbacGuard,
  ]);
  expect(Reflect.getMetadata(PATH_METADATA, PropertyBillingController)).toBe("rental-period-bills");
  expect(Reflect.getMetadata(METHOD_METADATA, PropertyBillingController.prototype.list)).toBe(
    RequestMethod.GET,
  );
  expect(
    Reflect.getMetadata(REQUIRE_PERMISSION_KEY, PropertyBillingController.prototype.list),
  ).toEqual(rentalPropertyBillingPermissions);
});
