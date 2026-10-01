import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";

import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { RentalSettlementsController } from "./rental-settlements.controller.js";

const contractId = "00000000-0000-4000-8000-000000000001";
const feeId = "00000000-0000-4000-8000-000000000002";
const idempotencyKey = "00000000-0000-4000-8000-000000000003";

type BoundSchema = {
  parse(value: unknown): unknown;
  safeParse(value: unknown): { success: boolean };
  shape: Record<string, unknown>;
};

type RouteParameterMetadata = {
  index: number;
  schema?: BoundSchema;
};

function boundSchema(handler: { name: string }, parameterIndex: number): BoundSchema {
  const parameters = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    RentalSettlementsController,
    handler.name,
  ) as Record<string, RouteParameterMetadata>;
  const schema = Object.values(parameters).find(
    (parameter) => parameter.index === parameterIndex,
  )?.schema;

  if (!schema) throw new Error(`Request schema is not bound to ${handler.name}`);
  return schema;
}

describe("RentalSettlementsController", () => {
  it("protects each action with the exact route, method, status, and permissions", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, RentalSettlementsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, RentalSettlementsController)).toBe(
      "rental-settlements",
    );

    const routes = [
      [
        RentalSettlementsController.prototype.detail,
        "detail",
        RequestMethod.GET,
        ["rental_contracts:read", "rental_settlements:read"],
      ],
      [
        RentalSettlementsController.prototype.history,
        "history",
        RequestMethod.GET,
        ["rental_contracts:read", "rental_settlements:read"],
      ],
      [
        RentalSettlementsController.prototype.preview,
        "preview",
        RequestMethod.POST,
        ["rental_contracts:read", "rental_bills:read", "rental_settlements:confirm"],
      ],
      [
        RentalSettlementsController.prototype.confirm,
        "confirm",
        RequestMethod.POST,
        ["rental_contracts:read", "rental_bills:read", "rental_settlements:confirm"],
      ],
    ] as const;

    for (const [handler, path, method, permissions] of routes) {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(permissions);
      if (method === RequestMethod.POST) {
        expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
      }
    }
  });

  it("binds strict detail/history query schemas with the required pagination defaults", () => {
    const detailSchema = boundSchema(RentalSettlementsController.prototype.detail, 1);
    const historySchema = boundSchema(RentalSettlementsController.prototype.history, 1);

    expect(Object.keys(detailSchema.shape)).toEqual(["contractId"]);
    expect(detailSchema.safeParse({ contractId }).success).toBe(true);
    expect(detailSchema.safeParse({ contractId, page: "1" }).success).toBe(false);
    expect(detailSchema.safeParse({ contractId: "invalid" }).success).toBe(false);

    expect(Object.keys(historySchema.shape)).toEqual(["contractId", "page", "pageSize"]);
    expect(historySchema.parse({ contractId })).toEqual({ contractId, page: 1, pageSize: 20 });
    expect(historySchema.parse({ contractId, page: "2", pageSize: "100" })).toEqual({
      contractId,
      page: 2,
      pageSize: 100,
    });
    expect(historySchema.safeParse({ contractId, pageSize: "101" }).success).toBe(false);
    expect(historySchema.safeParse({ contractId, unexpected: "value" }).success).toBe(false);
  });

  it("binds strict preview and confirmation schemas for signed fees and server-owned event data", () => {
    const previewSchema = boundSchema(RentalSettlementsController.prototype.preview, 1);
    const confirmSchema = boundSchema(RentalSettlementsController.prototype.confirm, 1);
    const previewInput = {
      contractId,
      extraFees: [{ id: feeId, name: " 费用调整 ", amountMinor: -5000, note: " 补充说明 " }],
    };
    const confirmation = {
      contractId,
      extraFees: [],
      expectedVersion: " version-1 ",
      idempotencyKey,
    };

    expect(Object.keys(previewSchema.shape)).toEqual(["contractId", "finalReadings", "extraFees"]);
    expect(previewSchema.parse(previewInput)).toEqual({
      contractId,
      extraFees: [{ id: feeId, name: "费用调整", amountMinor: -5000, note: "补充说明" }],
    });
    expect(
      previewSchema.safeParse({
        ...previewInput,
        extraFees: [{ id: feeId, name: "调整", amountMinor: 100, note: "说明", extra: true }],
      }).success,
    ).toBe(false);

    expect(Object.keys(confirmSchema.shape)).toEqual([
      "contractId",
      "finalReadings",
      "extraFees",
      "expectedVersion",
      "idempotencyKey",
    ]);
    expect(confirmSchema.parse(confirmation)).toEqual({
      ...confirmation,
      expectedVersion: "version-1",
    });
    const { expectedVersion: _expectedVersion, ...withoutVersion } = confirmation;
    const { idempotencyKey: _idempotencyKey, ...withoutIdempotencyKey } = confirmation;
    expect(confirmSchema.safeParse(withoutVersion).success).toBe(false);
    expect(confirmSchema.safeParse(withoutIdempotencyKey).success).toBe(false);
    for (const clientOwnedField of [
      { eventId: "00000000-0000-4000-8000-000000000004" },
      { kind: "termination" },
      { differenceMinor: -5000 },
    ]) {
      expect(confirmSchema.safeParse({ ...confirmation, ...clientOwnedField }).success).toBe(false);
    }
  });

  it("delegates the authenticated parsed inputs unchanged and preserves service results and errors", async () => {
    const detailResult = Promise.resolve({ settlement: null });
    const historyResult = Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 });
    const previewResult = Promise.resolve({} as never);
    const confirmResult = Promise.resolve({} as never);
    const service = {
      detail: vi.fn(() => detailResult),
      history: vi.fn(() => historyResult),
      preview: vi.fn(() => previewResult),
      confirm: vi.fn(() => confirmResult),
    };
    const controller = new RentalSettlementsController(service as never);
    const auth = { organizationId: "org", userId: "user" };
    const detailInput = { contractId };
    const historyInput = { contractId, page: 2, pageSize: 20 };
    const previewInput = {
      contractId,
      extraFees: [{ id: feeId, name: "费用调整", amountMinor: -5000, note: "说明" }],
    };
    const confirmInput = {
      contractId,
      extraFees: [],
      expectedVersion: "version-1",
      idempotencyKey,
    };

    expect(controller.detail(auth as never, detailInput)).toBe(detailResult);
    expect(controller.history(auth as never, historyInput)).toBe(historyResult);
    expect(controller.preview(auth as never, previewInput)).toBe(previewResult);
    expect(controller.confirm(auth as never, confirmInput)).toBe(confirmResult);
    expect(service.detail).toHaveBeenCalledWith(auth, detailInput);
    expect(service.history).toHaveBeenCalledWith(auth, historyInput);
    expect(service.preview).toHaveBeenCalledWith(auth, previewInput);
    expect(service.confirm).toHaveBeenCalledWith(auth, confirmInput);

    const failure = new Error("service failure");
    const rejected = Promise.reject(failure);
    service.confirm.mockReturnValueOnce(rejected);
    const propagated = controller.confirm(auth as never, confirmInput);
    expect(propagated).toBe(rejected);
    await expect(propagated).rejects.toBe(failure);
  });
});
