import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FoundationPage } from "./foundation-page";

describe("FoundationPage", () => {
  it("shows the shared app name and renders the API response after clicking", async () => {
    const user = userEvent.setup();
    const fetchHello = vi.fn().mockResolvedValue({
      appName: "Xpense",
      message: "Hello from Xpense API",
    });

    render(<FoundationPage fetchHello={fetchHello} />);

    expect(screen.getByRole("heading", { name: "Xpense" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "调用 API" }));

    expect(await screen.findByText("Hello from Xpense API")).toBeInTheDocument();
    expect(fetchHello).toHaveBeenCalledOnce();
  });

  it("shows a readable error when the API call fails", async () => {
    const user = userEvent.setup();
    const fetchHello = vi.fn().mockRejectedValue(new Error("API request failed with status 503"));

    render(<FoundationPage fetchHello={fetchHello} />);

    await user.click(screen.getByRole("button", { name: "调用 API" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "API request failed with status 503",
    );
  });
});
