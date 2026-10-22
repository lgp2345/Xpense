import { render, screen } from "@testing-library/react";
import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { NavUser } from "./nav-user";

describe("NavUser account identity", () => {
  it("shows a signed-in phone account without an email", () => {
    const currentUser = {
      id: "user-1",
      email: null,
      phone: "13800000001",
      isSuperAdmin: false,
      status: "active",
    } satisfies CurrentUserResponse["user"];
    const session = createWebSession({
      authStore: createAuthStore({ currentUser, status: "authenticated" }),
    });
    render(
      <SidebarProvider>
        <NavUser session={session} />
      </SidebarProvider>,
    );
    expect(screen.getByText("13800000001")).toBeInTheDocument();
    expect(screen.queryByText("未登录")).not.toBeInTheDocument();
  });
});
