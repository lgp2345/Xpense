import type { ReactNode } from "react";

type ProtectedRouteProps = {
  isAuthenticated: boolean;
  canAccess: boolean;
  children: ReactNode;
};

export function ProtectedRoute({ isAuthenticated, canAccess, children }: ProtectedRouteProps) {
  if (!isAuthenticated) {
    return <div>请先登录</div>;
  }

  if (!canAccess) {
    return <div>无权限访问</div>;
  }

  return <>{children}</>;
}
