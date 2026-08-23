import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";

import { REQUIRE_PERMISSION_KEY } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { BookkeepingModule } from "./bookkeeping.module.js";
import { StatisticsController } from "./statistics.controller.js";
import { StatisticsRepository } from "./statistics.repository.js";
import { StatisticsService } from "./statistics.service.js";

describe("StatisticsController", () => {
  it("publishes the exact guarded monthly statistics endpoint and permission", () => {
    expect(Reflect.getMetadata(PATH_METADATA, StatisticsController)).toBe("statistics");
    expect(Reflect.getMetadata(GUARDS_METADATA, StatisticsController)).toEqual([
      AuthGuard,
      RbacGuard,
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, StatisticsController.prototype.monthly)).toBe(
      "monthly",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, StatisticsController.prototype.monthly)).toBe(
      RequestMethod.GET,
    );
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, StatisticsController.prototype.monthly),
    ).toBe("statistics:read");
  });

  it("delegates the trusted authentication context and validated query DTO", async () => {
    const authContext = { organizationId: "organization-1", userId: "user-1" };
    const dto = { month: "2026-08" };
    const service = { monthly: vi.fn().mockResolvedValue({ currency: "CNY" }) };
    const controller = new StatisticsController(service as never);

    await controller.monthly(authContext as never, dto as never);

    expect(service.monthly).toHaveBeenCalledWith(authContext, dto);
  });

  it("registers the controller and its providers in the bookkeeping module", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BookkeepingModule)).toContain(
      StatisticsController,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BookkeepingModule)).toEqual(
      expect.arrayContaining([StatisticsRepository, StatisticsService]),
    );
  });
});
