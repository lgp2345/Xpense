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
import { AccountsController } from "./accounts.controller.js";
import { LedgersController } from "./ledgers.controller.js";

describe("bookkeeping controllers", () => {
  it("protects every route with authentication, RBAC and exact permissions", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AccountsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, LedgersController)).toEqual([AuthGuard, RbacGuard]);
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AccountsController.prototype.list)).toBe(
      "accounts:read",
    );
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AccountsController.prototype.create)).toBe(
      "accounts:create",
    );
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AccountsController.prototype.update)).toBe(
      "accounts:update",
    );
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AccountsController.prototype.delete)).toBe(
      "accounts:delete",
    );
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, LedgersController.prototype.list)).toBe(
      "ledgers:read",
    );
  });

  it("publishes the required action routes and HTTP methods", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AccountsController)).toBe("accounts");
    expect(Reflect.getMetadata(PATH_METADATA, LedgersController)).toBe("ledgers");

    const routes = [
      [AccountsController.prototype.list, "list", RequestMethod.GET, undefined],
      [AccountsController.prototype.create, "create", RequestMethod.POST, 200],
      [AccountsController.prototype.update, "update", RequestMethod.POST, 200],
      [AccountsController.prototype.delete, "delete", RequestMethod.POST, 200],
      [LedgersController.prototype.list, "list", RequestMethod.GET, undefined],
    ] as const;

    for (const [handler, path, method, status] of routes) {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status);
    }
  });

  it("delegates using the trusted auth context and validated DTO", async () => {
    const authContext = { organizationId: "organization-1", userId: "user-1" };
    const dto = { name: "现金", type: "cash" as const };
    const accountsService = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "account-1" }),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const ledgersService = { list: vi.fn().mockResolvedValue([]) };
    const accountsController = new AccountsController(accountsService as never);
    const ledgersController = new LedgersController(ledgersService as never);

    await accountsController.create(authContext as never, dto);
    await ledgersController.list(authContext as never);

    expect(accountsService.create).toHaveBeenCalledWith(authContext, dto);
    expect(ledgersService.list).toHaveBeenCalledWith(authContext);
  });
});
