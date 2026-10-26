import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "@/test/render-with-currency";

import { Dashboard } from "./dashboard";

describe("Dashboard", () => {
  it("keeps the authenticated home page available without a bookkeeping API", () => {
    render(<Dashboard />);

    expect(screen.getByRole("heading", { name: "仪表盘" })).toBeInTheDocument();
  });
});
