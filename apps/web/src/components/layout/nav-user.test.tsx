import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { NavUser } from "./nav-user";

describe("NavUser account identity", () => {
  it("shows a signed-in phone account without an email", () => {
    const currentUser = {
      initialPasswordUnchanged: true,
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

it("keeps the account password action available without organization membership", async () => {
  const user = userEvent.setup();
  const onChangePassword = vi.fn();
  const session = createWebSession({
    authStore: createAuthStore({
      status: "authenticated",
      accessScope: "platform",
      currentUser: { phone: "13800000001" } as never,
    }),
  });
  render(
    <SidebarProvider>
      <NavUser session={session} onChangePassword={onChangePassword} />
    </SidebarProvider>,
  );
  await user.click(screen.getByRole("button", { name: /13800000001/ }));
  await user.click(await screen.findByRole("menuitem", { name: "修改密码" }));
  expect(onChangePassword).toHaveBeenCalledOnce();
});
