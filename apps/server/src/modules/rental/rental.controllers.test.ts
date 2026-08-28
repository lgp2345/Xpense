import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";

import { AppModule } from "../../app.module.js";
import { BookkeepingWriteLockRepository } from "../bookkeeping/bookkeeping-write-lock.repository.js";
import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { PropertiesController } from "./properties.controller.js";
import { PropertiesRepository } from "./properties.repository.js";
import { PropertiesService } from "./properties.service.js";
import { PropertiesPolicyService } from "./properties-policy.service.js";
import { RentalModule } from "./rental.module.js";
import { SpacesController } from "./spaces.controller.js";
import { SpacesRepository } from "./spaces.repository.js";
import { SpacesService } from "./spaces.service.js";
import { SpacesPolicyService } from "./spaces-policy.service.js";

describe("rental property controller", () => {
  it("protects every route with authentication, RBAC, and exact permissions", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PropertiesController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);

    const permissions = [
      [PropertiesController.prototype.list, "rental_properties:read"],
      [PropertiesController.prototype.detail, "rental_properties:read"],
      [PropertiesController.prototype.create, "rental_properties:create"],
      [PropertiesController.prototype.update, "rental_properties:update"],
      [PropertiesController.prototype.setStatus, "rental_properties:update"],
      [PropertiesController.prototype.delete, "rental_properties:delete"],
    ] as const;

    for (const [handler, permission] of permissions) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toBe(permission);
    }
  });

  it("publishes the exact property paths, methods, and write status codes", () => {
    expect(Reflect.getMetadata(PATH_METADATA, PropertiesController)).toBe("rental-properties");

    const routes = [
      [PropertiesController.prototype.list, "list", RequestMethod.GET, undefined],
      [PropertiesController.prototype.detail, "detail", RequestMethod.GET, undefined],
      [PropertiesController.prototype.create, "create", RequestMethod.POST, 200],
      [PropertiesController.prototype.update, "update", RequestMethod.POST, 200],
      [PropertiesController.prototype.setStatus, "set-status", RequestMethod.POST, 200],
      [PropertiesController.prototype.delete, "delete", RequestMethod.POST, 200],
    ] as const;

    for (const [handler, path, method, status] of routes) {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status);
    }
  });

  it("delegates only the trusted auth context and validated DTOs", async () => {
    const authContext = { organizationId: "organization-1", userId: "user-1" };
    const query = { page: 1, pageSize: 20 };
    const detail = { id: "property-1" };
    const create = {
      name: "阳光公寓",
      type: "apartment_building" as const,
      countryCode: "CN",
      addressLine: "科技园 1 号",
    };
    const update = { id: "property-1", name: "阳光公寓二期" };
    const status = { id: "property-1", isActive: false };
    const remove = { id: "property-1" };
    const service = {
      list: vi.fn().mockResolvedValue({ items: [] }),
      detail: vi.fn().mockResolvedValue({ id: "property-1" }),
      create: vi.fn().mockResolvedValue({ id: "property-1" }),
      update: vi.fn().mockResolvedValue({ id: "property-1" }),
      setStatus: vi.fn().mockResolvedValue({ id: "property-1" }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new PropertiesController(service as never);

    await controller.list(authContext as never, query as never);
    await controller.detail(authContext as never, detail as never);
    await controller.create(authContext as never, create as never);
    await controller.update(authContext as never, update as never);
    await controller.setStatus(authContext as never, status as never);
    await controller.delete(authContext as never, remove as never);

    expect(service.list).toHaveBeenCalledWith(authContext, query);
    expect(service.detail).toHaveBeenCalledWith(authContext, detail);
    expect(service.create).toHaveBeenCalledWith(authContext, create);
    expect(service.update).toHaveBeenCalledWith(authContext, update);
    expect(service.setStatus).toHaveBeenCalledWith(authContext, status);
    expect(service.delete).toHaveBeenCalledWith(authContext, remove);
  });

  it("registers the rental feature without exporting its repositories", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RentalModule)).toEqual([
      PropertiesController,
      SpacesController,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RentalModule)).toEqual(
      expect.arrayContaining([
        BookkeepingWriteLockRepository,
        PropertiesRepository,
        PropertiesPolicyService,
        PropertiesService,
      ]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalModule) ?? []).not.toContain(
      PropertiesRepository,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(RentalModule);
  });
});

describe("rental space controller", () => {
  it("protects every route with authentication, RBAC, and exact permissions", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SpacesController)).toEqual([AuthGuard, RbacGuard]);

    const permissions = [
      [SpacesController.prototype.listChildren, "rental_spaces:read"],
      [SpacesController.prototype.search, "rental_spaces:read"],
      [SpacesController.prototype.create, "rental_spaces:create"],
      [SpacesController.prototype.batchCreate, "rental_spaces:create"],
      [SpacesController.prototype.update, "rental_spaces:update"],
      [SpacesController.prototype.move, "rental_spaces:update"],
      [SpacesController.prototype.setStatus, "rental_spaces:update"],
      [SpacesController.prototype.delete, "rental_spaces:delete"],
    ] as const;

    for (const [handler, permission] of permissions) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toBe(permission);
    }
  });

  it("publishes the exact space paths, methods, and write status codes", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SpacesController)).toBe("rental-spaces");

    const routes = [
      [SpacesController.prototype.listChildren, "children", RequestMethod.GET, undefined],
      [SpacesController.prototype.search, "search", RequestMethod.GET, undefined],
      [SpacesController.prototype.create, "create", RequestMethod.POST, 200],
      [SpacesController.prototype.batchCreate, "batch-create", RequestMethod.POST, 200],
      [SpacesController.prototype.update, "update", RequestMethod.POST, 200],
      [SpacesController.prototype.move, "move", RequestMethod.POST, 200],
      [SpacesController.prototype.setStatus, "set-status", RequestMethod.POST, 200],
      [SpacesController.prototype.delete, "delete", RequestMethod.POST, 200],
    ] as const;

    for (const [handler, path, method, status] of routes) {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status);
    }
  });

  it("delegates only trusted auth context and validated space DTOs", async () => {
    const authContext = { organizationId: "organization-1", userId: "user-1" };
    const children = { propertyId: "property-1", parentId: null, page: 1, pageSize: 20 };
    const search = { propertyId: "property-1", keyword: "101", page: 1, pageSize: 20 };
    const create = {
      propertyId: "property-1",
      name: "101",
      type: "room" as const,
      isRentable: true,
    };
    const batch = {
      propertyId: "property-1",
      type: "room" as const,
      isRentable: true,
      items: [{ name: "101" }],
    };
    const update = { id: "space-1", name: "102" };
    const move = { id: "space-1", parentId: null, sortOrder: 1 };
    const status = { id: "space-1", isActive: false };
    const remove = { id: "space-1" };
    const service = {
      listChildren: vi.fn().mockResolvedValue({ items: [] }),
      search: vi.fn().mockResolvedValue({ items: [] }),
      create: vi.fn().mockResolvedValue({ id: "space-1" }),
      batchCreate: vi.fn().mockResolvedValue({ ids: ["space-1"] }),
      update: vi.fn().mockResolvedValue({ id: "space-1" }),
      move: vi.fn().mockResolvedValue({ id: "space-1" }),
      setStatus: vi.fn().mockResolvedValue({ id: "space-1" }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new SpacesController(service as never);

    await controller.listChildren(authContext as never, children as never);
    await controller.search(authContext as never, search as never);
    await controller.create(authContext as never, create as never);
    await controller.batchCreate(authContext as never, batch as never);
    await controller.update(authContext as never, update as never);
    await controller.move(authContext as never, move as never);
    await controller.setStatus(authContext as never, status as never);
    await controller.delete(authContext as never, remove as never);

    expect(service.listChildren).toHaveBeenCalledWith(authContext, children);
    expect(service.search).toHaveBeenCalledWith(authContext, search);
    expect(service.create).toHaveBeenCalledWith(authContext, create);
    expect(service.batchCreate).toHaveBeenCalledWith(authContext, batch);
    expect(service.update).toHaveBeenCalledWith(authContext, update);
    expect(service.move).toHaveBeenCalledWith(authContext, move);
    expect(service.setStatus).toHaveBeenCalledWith(authContext, status);
    expect(service.delete).toHaveBeenCalledWith(authContext, remove);
  });

  it("registers space providers without exporting repositories", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RentalModule)).toEqual([
      PropertiesController,
      SpacesController,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RentalModule)).toEqual(
      expect.arrayContaining([SpacesRepository, SpacesPolicyService, SpacesService]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalModule) ?? []).not.toContain(
      SpacesRepository,
    );
  });
});
