import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { SearchProvider } from "@/context/search-provider";
import { ThemeProvider } from "@/context/theme-provider";

import { Toaster } from "./ui/sonner";
import { TooltipProvider } from "./ui/tooltip";

type AppProvidersProps = {
  children: ReactNode;
  queryClient?: QueryClient;
};

/** 提供应用级 UI 上下文与可隔离注入的服务端查询缓存。 */
export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [defaultQueryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient ?? defaultQueryClient}>
      <ThemeProvider>
        <SearchProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </SearchProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
