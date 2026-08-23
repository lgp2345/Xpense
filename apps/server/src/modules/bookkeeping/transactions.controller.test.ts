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
import { BookkeepingWriteLockRepository } from "./bookkeeping-write-lock.repository.js";
import { TransactionsController } from "./transactions.controller.js";
import { TransactionsRepository } from "./transactions.repository.js";
import { TransactionsService } from "./transactions.service.js";

describe("TransactionsController", () => {
  it("protects every route with authentication, RBAC, and the exact transaction permission", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TransactionsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, TransactionsController.prototype.list)).toBe(
      "transactions:read",
    );
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, TransactionsController.prototype.detail),
    ).toBe("transactions:read");
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, TransactionsController.prototype.create),
    ).toBe("transactions:create");
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, TransactionsController.prototype.update),
    ).toBe("transactions:update");
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, TransactionsController.prototype.delete),
    ).toBe("transactions:delete");
  });

  it("publishes the exact action paths, methods, and write status codes", () => {
    expect(Reflect.getMetadata(PATH_METADATA, TransactionsController)).toBe("transactions");
    const routes = [
      [TransactionsController.prototype.list, "list", RequestMethod.GET, undefined],
      [TransactionsController.prototype.detail, "detail", RequestMethod.GET, undefined],
      [TransactionsController.prototype.create, "create", RequestMethod.POST, 200],
      [TransactionsController.prototype.update, "update", RequestMethod.POST, 200],
      [TransactionsController.prototype.delete, "delete", RequestMethod.POST, 200],
    ] as const;

    for (const [handler, path, method, status] of routes) {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status);
    }
  });

  it("delegates only trusted auth context and validated DTOs", async () => {
    const authContext = { organizationId: "organization-1", userId: "user-1" };
    const filters = { page: 1, pageSize: 20 };
    const detail = { id: "transaction-1" };
    const service = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, ...filters }),
      detail: vi.fn().mockResolvedValue({ id: "transaction-1" }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const controller = new TransactionsController(service as never);

    await controller.list(authContext as never, filters);
    await controller.detail(authContext as never, detail);

    expect(service.list).toHaveBeenCalledWith(authContext, filters);
    expect(service.detail).toHaveBeenCalledWith(authContext, detail);
  });

  it("registers the transaction controller and providers in the bookkeeping feature module", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BookkeepingModule)).toContain(
      TransactionsController,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BookkeepingModule)).toEqual(
      expect.arrayContaining([
        BookkeepingWriteLockRepository,
        TransactionsRepository,
        TransactionsService,
      ]),
    );
  });
});
