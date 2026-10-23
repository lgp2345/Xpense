import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import { createAppRouter } from "@/router";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

const context: CurrentUserResponse = {
  accessScope: "platform",
  user: {
    id: "super",
    email: null,
    phone: "13800000006",
    isSuperAdmin: true,
    status: "active",
    initialPasswordUnchanged: true,
  },
  organization: null,
  role: null,
  permissions: [],
  session: { id: "session", clientType: "web_pc" },
};
function setup(path: string) {
  const store = createAuthStore({ accessToken: "platform-token" });
  store.getState().setCurrentUserContext(context);
  const session = createWebSession({ authStore: store });
  vi.spyOn(session.authApi, "listOrganizations").mockResolvedValue([]);
  const list = vi
    .spyOn(session.organizationsApi, "list")
    .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  const menu = vi.spyOn(session.iamApi, "getAuthorizedMenus");
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    session,
  });
  return { store, session, list, menu, router };
}
describe("platform file routes", () => {
  it("restores URL filters and renders the organization switcher without business menu requests", async () => {
    const h = setup("/platform/organizations?page=2&pageSize=50&status=disabled&name=test");
    render(
      <AppProviders
        queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RouterProvider router={h.router} />
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "组织管理" })).toBeVisible();
    await waitFor(() =>
      expect(h.list).toHaveBeenCalledWith({
        page: 2,
        pageSize: 50,
        status: "disabled",
        name: "test",
      }),
    );
    expect(h.menu).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /未选择组织/ })).toBeVisible();
    expect(screen.getByRole("link", { name: "菜单恢复" })).toBeVisible();
  });
  it("returns from details to the real list URL and restores its filters", async () => {
    const h = setup("/platform/organizations");
    vi.spyOn(h.session.organizationsApi, "detail").mockResolvedValue({
      id: "org",
      name: "组织详情示例",
      status: "active",
      baseCurrency: "CNY",
      timezone: "Asia/Shanghai",
      contactName: null,
      contactPhone: null,
      address: null,
      owners: [],
    });
    await h.router.navigate({
      to: "/platform/organizations",
      search: { page: 2, pageSize: 50, name: "原筛选" },
    });
    await h.router.navigate({
      to: "/platform/organizations/$organizationId",
      params: { organizationId: "org" },
    });
    render(
      <AppProviders>
        <RouterProvider router={h.router} />
      </AppProviders>,
    );
    await screen.findByRole("heading", { name: "组织详情示例" });
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await waitFor(() =>
      expect(h.router.state.location.search).toMatchObject({
        page: 2,
        pageSize: 50,
        name: "原筛选",
      }),
    );
  });
  it("sends an authenticated platform account visiting a business URL to organization management", async () => {
    const h = setup("/members");
    await h.router.load();
    expect(h.router.state.location.pathname).toBe("/platform/organizations");
    expect(h.menu).not.toHaveBeenCalled();
  });
  it("sends a fresh platform credential login to organization management despite a business redirect", async () => {
    const h = setup("/login?redirect=%2Fmembers");
    await h.router.load();
    expect(h.router.state.location.pathname).toBe("/platform/organizations");
  });
  it("rejects an ordinary account before the platform query", async () => {
    const h = setup("/platform/organizations");
    h.store.getState().setCurrentUserContext({
      ...context,
      accessScope: "organization",
      organization: {
        id: "org",
        name: "组织",
        baseCurrency: "CNY",
        timezone: "Asia/Shanghai",
        status: "active",
      },
      user: { ...context.user, isSuperAdmin: false },
    });
    await h.router.load();
    expect(h.router.state.location.pathname).toBe("/forbidden");
    expect(h.list).not.toHaveBeenCalled();
  });
  it("opens mobile platform navigation without fetching organization menus", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(max-width: 767px)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    try {
      const h = setup("/platform/organizations");
      render(
        <AppProviders>
          <RouterProvider router={h.router} />
        </AppProviders>,
      );
      await screen.findByRole("heading", { name: "组织管理" });
      await userEvent.click(screen.getByRole("button", { name: "切换侧栏" }));
      expect(await screen.findByRole("link", { name: "菜单恢复" })).toBeVisible();
      expect(h.menu).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });
});
