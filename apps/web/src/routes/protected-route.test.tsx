import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProtectedRoute } from "./protected-route";

describe("ProtectedRoute", () => {
  it("renders children when authenticated and allowed", () => {
    render(
      <ProtectedRoute isAuthenticated canAccess>
        <div>受保护内容</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("受保护内容")).toBeInTheDocument();
  });

  it("renders a login prompt when unauthenticated", () => {
    render(
      <ProtectedRoute isAuthenticated={false} canAccess={false}>
        <div>受保护内容</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("请先登录")).toBeInTheDocument();
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument();
  });

  it("renders forbidden when authenticated but not allowed", () => {
    render(
      <ProtectedRoute isAuthenticated canAccess={false}>
        <div>受保护内容</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("无权限访问")).toBeInTheDocument();
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument();
  });
});
