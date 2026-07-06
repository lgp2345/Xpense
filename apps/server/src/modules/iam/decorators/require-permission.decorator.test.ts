import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { REQUIRE_PERMISSION_KEY, RequirePermission } from "./require-permission.decorator.js";

describe("RequirePermission", () => {
  it("stores required permission metadata", () => {
    class TestController {
      @RequirePermission("roles.update")
      updateRole() {
        return "ok";
      }
    }

    const reflector = new Reflector();
    const permission = reflector.get(REQUIRE_PERMISSION_KEY, TestController.prototype.updateRole);

    expect(permission).toBe("roles.update");
  });
});
