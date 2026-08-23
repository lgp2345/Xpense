import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";

import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { BookkeepingModule } from "./bookkeeping.module.js";
import { CategoriesController } from "./categories.controller.js";
import { CategoriesRepository } from "./categories.repository.js";
import { CategoriesService } from "./categories.service.js";
import { CategoriesPolicyService } from "./categories-policy.service.js";

describe("CategoriesController", () => {
  it("protects every category route with authentication, RBAC, and its exact permission", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CategoriesController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, CategoriesController.prototype.list)).toBe(
      "categories:read",
    );
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, CategoriesController.prototype.create)).toBe(
      "categories:create",
    );
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, CategoriesController.prototype.update)).toBe(
      "categories:update",
    );
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, CategoriesController.prototype.delete)).toBe(
      "categories:delete",
    );
  });

  it("publishes the exact category action paths, methods, and write status codes", () => {
    expect(Reflect.getMetadata(PATH_METADATA, CategoriesController)).toBe("categories");

    const routes = [
      [CategoriesController.prototype.list, "list", RequestMethod.GET, undefined],
      [CategoriesController.prototype.create, "create", RequestMethod.POST, 200],
      [CategoriesController.prototype.update, "update", RequestMethod.POST, 200],
      [CategoriesController.prototype.delete, "delete", RequestMethod.POST, 200],
    ] as const;

    for (const [handler, path, method, status] of routes) {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status);
    }
  });

  it("only delegates the trusted auth context and validated DTO", async () => {
    const authContext = { organizationId: "organization-1", userId: "user-1" };
    const query = { ledgerId: "ledger-1", type: "expense" as const };
    const dto = { ledgerId: "ledger-1", type: "expense" as const, name: "餐饮" };
    const service = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "category-1" }),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const controller = new CategoriesController(service as never);

    await controller.list(authContext as never, query);
    await controller.create(authContext as never, dto);

    expect(service.list).toHaveBeenCalledWith(authContext, query);
    expect(service.create).toHaveBeenCalledWith(authContext, dto);
  });

  it("registers the category controller/providers and exports its transaction validator repository", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BookkeepingModule)).toContain(
      CategoriesController,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BookkeepingModule)).toEqual(
      expect.arrayContaining([CategoriesRepository, CategoriesPolicyService, CategoriesService]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, BookkeepingModule)).toContain(
      CategoriesRepository,
    );
  });
});
