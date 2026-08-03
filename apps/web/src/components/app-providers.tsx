import type { ReactNode } from "react";
import { SearchProvider } from "@/context/search-provider";
import { ThemeProvider } from "@/context/theme-provider";

import { Toaster } from "./ui/sonner";
import { TooltipProvider } from "./ui/tooltip";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <SearchProvider>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </SearchProvider>
    </ThemeProvider>
  );
}
