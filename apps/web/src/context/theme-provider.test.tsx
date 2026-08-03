import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "./theme-provider";

function ThemeProbe() {
  const { setTheme } = useTheme();

  return (
    <button type="button" onClick={() => setTheme("dark")}>
      使用深色主题
    </button>
  );
}

type MatchMediaController = {
  change: (matches: boolean) => void;
};

function mockMatchMedia(initialMatches: boolean): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const removeEventListener = (type: string, listener: EventListenerOrEventListenerObject) => {
    if (type === "change" && typeof listener === "function") {
      listeners.delete(listener as (event: MediaQueryListEvent) => void);
    }
  };

  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
        if (type === "change" && typeof listener === "function") {
          listeners.add(listener as (event: MediaQueryListEvent) => void);
        }
      },
      removeEventListener,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }),
  );

  return {
    change(nextMatches) {
      matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark", "light");
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("applies and persists the selected theme", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();

    render(
      <ThemeProvider defaultTheme="system" storageKey="xpense-ui-theme">
        <ThemeProbe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "使用深色主题" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("xpense-ui-theme")).toBe("dark");
  });

  it("follows system color changes and removes its listener when unmounted", () => {
    const mediaQuery = mockMatchMedia(true);
    const { unmount } = render(
      <ThemeProvider defaultTheme="system" storageKey="xpense-ui-theme">
        <span>主题</span>
      </ThemeProvider>,
    );

    expect(document.documentElement).toHaveClass("dark");

    mediaQuery.change(false);

    expect(document.documentElement).not.toHaveClass("dark");

    unmount();

    mediaQuery.change(true);

    expect(document.documentElement).not.toHaveClass("dark");
  });
});
