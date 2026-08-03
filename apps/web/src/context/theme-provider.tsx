import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

export type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

const DEFAULT_THEME: Theme = "system";
const DEFAULT_STORAGE_KEY = "xpense-ui-theme";
const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

function getStoredTheme(storageKey: string): Theme | null {
  const theme = window.localStorage.getItem(storageKey);

  return theme === "dark" || theme === "light" || theme === "system" ? theme : null;
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setStoredTheme] = useState<Theme>(() => getStoredTheme(storageKey) ?? defaultTheme);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (resolvedTheme: Exclude<Theme, "system">) => {
      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
    };

    if (theme !== "system") {
      applyTheme(theme);
      return;
    }

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      applyTheme(event.matches ? "dark" : "light");
    };

    applyTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [theme]);

  const setTheme = (nextTheme: Theme) => {
    window.localStorage.setItem(storageKey, nextTheme);
    setStoredTheme(nextTheme);
  };

  return <ThemeProviderContext value={{ theme, setTheme }}>{children}</ThemeProviderContext>;
}

export function useTheme(): ThemeProviderState {
  const context = useContext(ThemeProviderContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
