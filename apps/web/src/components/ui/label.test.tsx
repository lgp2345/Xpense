import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Label } from "./label";

describe("Label", () => {
  it("preserves the accessible label without an automatic required decoration", () => {
    render(
      <>
        <Label htmlFor="name">名称</Label>
        <input id="name" />
      </>,
    );
    expect(screen.getByLabelText("名称")).toBeInTheDocument();
    expect(screen.getByText("名称").firstElementChild).toBeNull();
  });
});
