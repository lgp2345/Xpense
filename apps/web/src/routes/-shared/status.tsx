import { type ReactNode, Suspense } from "react";

export function RouteAccessPending() {
  return <RouteStatus>正在验证页面访问权限...</RouteStatus>;
}

export function renderLazyPage(page: ReactNode): ReactNode {
  return <Suspense fallback={<PageLoading />}>{page}</Suspense>;
}

function PageLoading() {
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
