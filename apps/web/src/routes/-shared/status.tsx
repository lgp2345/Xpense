import type { ReactNode } from "react";

export function RouteAccessPending() {
  return <RouteStatus>正在加载页面...</RouteStatus>;
}

function RouteStatus({ children }: { children: ReactNode }) {
  return (
    <main
      aria-live="polite"
      className="grid min-h-[50dvh] place-items-center text-sm text-muted-foreground"
    >
      {children}
    </main>
  );
}
