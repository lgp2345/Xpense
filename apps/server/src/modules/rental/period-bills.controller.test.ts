import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import { expect, it } from "vitest";
import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { PeriodBillsController } from "./period-bills.controller.js";

it("账期 controller 有认证和独立权限，写操作固定POST200", () => {
  expect(Reflect.getMetadata(GUARDS_METADATA, PeriodBillsController)).toEqual([
    AuthGuard,
    RbacGuard,
  ]);
  expect(Reflect.getMetadata(PATH_METADATA, PeriodBillsController)).toBe("rental-period-bills");
  for (const handler of [
    PeriodBillsController.prototype.preview,
    PeriodBillsController.prototype.generate,
  ]) {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toContain(
      "rental_period_bills:generate",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  }
  expect(Reflect.getMetadata(METHOD_METADATA, PeriodBillsController.prototype.context)).toBe(
    RequestMethod.GET,
  );
});
