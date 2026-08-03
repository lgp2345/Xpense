import type { ReactNode } from "react";

import { ThemeProvider } from "@/context/theme-provider";

import { Toaster } from "./ui/sonner";
import { TooltipProvider } from "./ui/tooltip";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
