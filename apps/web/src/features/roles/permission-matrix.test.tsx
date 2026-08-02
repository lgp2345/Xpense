import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PermissionMatrix } from "./permission-matrix.js";

describe("PermissionMatrix", () => {
  it("disables permission editing without roles.permissions.update", () => {
    render(
      <PermissionMatrix
        canUpdatePermissions={false}
        permissions={[{ key: "roles.read", name: "roles.read", resource: "roles", action: "read" }]}
        selected={["roles.read"]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "roles.read" })).toBeDisabled();
  });

  it("disables permission editing for roles that cannot be edited", () => {
    render(
      <PermissionMatrix
        canUpdatePermissions
        isEditable={false}
        permissions={[{ key: "roles.read", name: "roles.read", resource: "roles", action: "read" }]}
        selected={["roles.read"]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "roles.read" })).toBeDisabled();
  });
});
