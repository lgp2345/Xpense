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
import { ContractLifecycleService } from "./contract-lifecycle.service.js";
import { ContractPartiesService } from "./contract-parties.service.js";
import { ContractRelationsRepository } from "./contract-relations.repository.js";
import { ContractsController } from "./contracts.controller.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsService } from "./contracts.service.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { PropertiesController } from "./properties.controller.js";
import { PropertiesRepository } from "./properties.repository.js";
import { PropertiesService } from "./properties.service.js";
import { PropertiesPolicyService } from "./properties-policy.service.js";
import { RentalModule } from "./rental.module.js";
import { SpacesController } from "./spaces.controller.js";
import { SpacesRepository } from "./spaces.repository.js";
import { SpacesService } from "./spaces.service.js";
import { SpacesPolicyService } from "./spaces-policy.service.js";
import { TenantsController } from "./tenants.controller.js";
import { TenantsRepository } from "./tenants.repository.js";
import { TenantsService } from "./tenants.service.js";
import { TenantsPolicyService } from "./tenants-policy.service.js";

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
      TenantsController,
      ContractsController,
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
      [SpacesController.prototype.getSubtreeDepth, "rental_spaces:read"],
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
      [SpacesController.prototype.getSubtreeDepth, "subtree-depth", RequestMethod.GET, undefined],
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
    const subtreeDepth = { propertyId: "property-1", id: "space-1" };
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
      getSubtreeDepth: vi.fn().mockResolvedValue({ relativeDepth: 1 }),
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
    await controller.getSubtreeDepth(authContext as never, subtreeDepth as never);
    await controller.create(authContext as never, create as never);
    await controller.batchCreate(authContext as never, batch as never);
    await controller.update(authContext as never, update as never);
    await controller.move(authContext as never, move as never);
    await controller.setStatus(authContext as never, status as never);
    await controller.delete(authContext as never, remove as never);

    expect(service.listChildren).toHaveBeenCalledWith(authContext, children);
    expect(service.search).toHaveBeenCalledWith(authContext, search);
    expect(service.getSubtreeDepth).toHaveBeenCalledWith(authContext, subtreeDepth);
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
      TenantsController,
      ContractsController,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RentalModule)).toEqual(
      expect.arrayContaining([SpacesRepository, SpacesPolicyService, SpacesService]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalModule) ?? []).not.toContain(
      SpacesRepository,
    );
  });
});
describe("rental tenant controller", () => {
  it("protects every route with authentication, RBAC, and exact permissions", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TenantsController)).toEqual([AuthGuard, RbacGuard]);
    const permissions = [
      [TenantsController.prototype.list, "rental_tenants:read"],
      [TenantsController.prototype.detail, "rental_tenants:read"],
      [TenantsController.prototype.create, "rental_tenants:create"],
      [TenantsController.prototype.update, "rental_tenants:update"],
      [TenantsController.prototype.setStatus, "rental_tenants:update"],
      [TenantsController.prototype.delete, "rental_tenants:delete"],
      [
        TenantsController.prototype.revealSensitive,
        ["rental_tenants:read", "rental_tenants:sensitive_read"],
      ],
    ] as const;
    for (const [handler, permission] of permissions) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(permission);
    }
  });

  it("publishes the exact tenant paths, methods, and write status codes", () => {
    expect(Reflect.getMetadata(PATH_METADATA, TenantsController)).toBe("rental-tenants");
    const routes = [
      [TenantsController.prototype.list, "list", RequestMethod.GET, undefined],
      [TenantsController.prototype.detail, "detail", RequestMethod.GET, undefined],
      [TenantsController.prototype.create, "create", RequestMethod.POST, 200],
      [TenantsController.prototype.update, "update", RequestMethod.POST, 200],
      [TenantsController.prototype.setStatus, "set-status", RequestMethod.POST, 200],
      [TenantsController.prototype.delete, "delete", RequestMethod.POST, 200],
      [TenantsController.prototype.revealSensitive, "reveal-sensitive", RequestMethod.POST, 200],
    ] as const;
    for (const [handler, path, method, status] of routes) {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status);
    }
  });

  it("delegates only trusted auth context and validated tenant DTOs", async () => {
    const auth = { organizationId: "organization-1", userId: "user-1" };
    const inputs = {
      list: { page: 1, pageSize: 20 },
      detail: { id: "tenant-1" },
      create: { type: "individual" as const, name: "张三" },
      update: { id: "tenant-1", phone: null },
      setStatus: { id: "tenant-1", isActive: false },
      delete: { id: "tenant-1" },
      revealSensitive: { id: "tenant-1" },
    };
    const service = Object.fromEntries(
      Object.keys(inputs).map((name) => [name, vi.fn().mockResolvedValue({ id: "tenant-1" })]),
    );
    const controller = new TenantsController(service as never);
    for (const [name, dto] of Object.entries(inputs)) {
      await controller[name as keyof typeof inputs](auth as never, dto as never);
      expect(service[name]).toHaveBeenCalledWith(auth, dto);
    }
  });

  it("registers tenant providers without exporting its repository", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RentalModule)).toEqual(
      expect.arrayContaining([TenantsRepository, TenantsPolicyService, TenantsService]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalModule) ?? []).not.toContain(
      TenantsRepository,
    );
  });
});

describe("rental contract controller", () => {
  it("protects each core contract route with exact permissions", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ContractsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    const permissions = [
      [ContractsController.prototype.list, "rental_contracts:read"],
      [ContractsController.prototype.detail, "rental_contracts:read"],
      [ContractsController.prototype.create, "rental_contracts:create"],
      [ContractsController.prototype.update, "rental_contracts:update"],
      [ContractsController.prototype.checkAvailability, "rental_contracts:read"],
      [ContractsController.prototype.confirm, "rental_contracts:update"],
      [ContractsController.prototype.cancel, "rental_contracts:update"],
      [ContractsController.prototype.changeParties, "rental_contracts:update"],
      [ContractsController.prototype.terminate, "rental_contracts:update"],
      [ContractsController.prototype.revokeTermination, "rental_contracts:update"],
      [ContractsController.prototype.renew, "rental_contracts:update"],
      [
        ContractsController.prototype.revealSensitive,
        ["rental_contracts:read", "rental_tenants:sensitive_read"],
      ],
      [ContractsController.prototype.delete, "rental_contracts:delete"],
    ] as const;
    for (const [handler, permission] of permissions) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(permission);
    }
  });

  it("publishes action-style paths with GET reads and POST 200 writes", () => {
    expect(Reflect.getMetadata(PATH_METADATA, ContractsController)).toBe("rental-contracts");
    const routes = [
      [ContractsController.prototype.list, "list", RequestMethod.GET, undefined],
      [ContractsController.prototype.detail, "detail", RequestMethod.GET, undefined],
      [ContractsController.prototype.create, "create", RequestMethod.POST, 200],
      [ContractsController.prototype.update, "update", RequestMethod.POST, 200],
      [
        ContractsController.prototype.checkAvailability,
        "check-availability",
        RequestMethod.POST,
        200,
      ],
      [ContractsController.prototype.confirm, "confirm", RequestMethod.POST, 200],
      [ContractsController.prototype.cancel, "cancel", RequestMethod.POST, 200],
      [ContractsController.prototype.changeParties, "change-parties", RequestMethod.POST, 200],
      [ContractsController.prototype.terminate, "terminate", RequestMethod.POST, 200],
      [
        ContractsController.prototype.revokeTermination,
        "revoke-termination",
        RequestMethod.POST,
        200,
      ],
      [ContractsController.prototype.renew, "renew", RequestMethod.POST, 200],
      [ContractsController.prototype.revealSensitive, "reveal-sensitive", RequestMethod.POST, 200],
      [ContractsController.prototype.delete, "delete", RequestMethod.POST, 200],
    ] as const;
    for (const [handler, path, method, status] of routes) {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status);
    }
  });

  it("delegates only trusted auth context and validated contract DTOs", async () => {
    const authContext = { organizationId: "organization-1", userId: "user-1" };
    const coreInputs = {
      list: { page: 1, pageSize: 20 },
      detail: { id: "contract-1" },
      create: { propertyId: "property-1" },
      update: { id: "contract-1", note: "新备注" },
      checkAvailability: {
        propertyId: "property-1",
        spaceIds: ["space-1"],
        startDate: "2026-09-01",
        endDate: "2027-08-31",
      },
      delete: { id: "contract-1" },
    };
    const lifecycleInputs = {
      confirm: { id: "contract-1" },
      cancel: { id: "contract-1", reason: "计划有变" },
      terminate: { id: "contract-1", terminationDate: "2027-01-01", reason: "提前退租" },
      revokeTermination: { id: "contract-1", reason: "恢复" },
      renew: { id: "contract-1" },
    };
    const partyInputs = {
      changeParties: {
        id: "contract-1",
        effectiveDate: "2026-10-01",
        reason: "变更",
        parties: [{ tenantId: "tenant-1", isPrimaryPayer: true }],
      },
      revealSensitive: { contractId: "contract-1", tenantId: "tenant-1", validFrom: "2026-01-01" },
    };
    const contracts = Object.fromEntries(
      Object.keys(coreInputs).map((name) => [
        name,
        vi.fn().mockResolvedValue({ id: "contract-1" }),
      ]),
    );
    const lifecycle = Object.fromEntries(
      Object.keys(lifecycleInputs).map((name) => [
        name,
        vi.fn().mockResolvedValue({ id: "contract-1" }),
      ]),
    );
    const parties = Object.fromEntries(
      Object.keys(partyInputs).map((name) => [
        name,
        vi.fn().mockResolvedValue({ id: "contract-1" }),
      ]),
    );
    const controller = new ContractsController(
      contracts as never,
      lifecycle as never,
      parties as never,
    );
    for (const [name, dto] of Object.entries(coreInputs)) {
      await controller[name as keyof typeof coreInputs](authContext as never, dto as never);
      expect(contracts[name]).toHaveBeenCalledWith(authContext, dto);
    }
    for (const [name, dto] of Object.entries(lifecycleInputs)) {
      await controller[name as keyof typeof lifecycleInputs](authContext as never, dto as never);
      expect(lifecycle[name]).toHaveBeenCalledWith(authContext, dto);
    }
    for (const [name, dto] of Object.entries(partyInputs)) {
      await controller[name as keyof typeof partyInputs](authContext as never, dto as never);
      expect(parties[name]).toHaveBeenCalledWith(authContext, dto);
    }
  });

  it("registers contract providers without exporting repositories", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, RentalModule)).toEqual([
      PropertiesController,
      SpacesController,
      TenantsController,
      ContractsController,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RentalModule)).toEqual(
      expect.arrayContaining([
        ContractsRepository,
        ContractRelationsRepository,
        ContractsPolicyService,
        ContractsService,
        ContractLifecycleService,
        ContractPartiesService,
      ]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalModule) ?? []).not.toContain(
      ContractsRepository,
    );
  });
});
