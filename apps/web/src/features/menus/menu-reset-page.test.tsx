import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import type { UserOrganization } from "@/services/auth-api";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";
import { MenuResetPage } from "./menu-reset-page";

const activeOrganization: UserOrganization = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "个人账本",
  status: "active",
};
const otherOrganization: UserOrganization = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "家庭账本",
  status: "active",
};
const organizations = [activeOrganization, otherOrganization];

function authorizedMenu(id: number, name: string): AuthorizedMenuNode {
  return {
    id,
    parentId: null,
    type: "menu",
    name,
    sortOrder: id,
    icon: null,
    isVisible: true,
    routeKey: "Dashboard",
    path: "/",
    url: null,
    permissionCode: "dashboard:read",
    isExternal: false,
    keepAlive: false,
    children: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

function createHarness() {
  const authStore = createAuthStore({
    accessToken: "access-token",
    currentUser: {
      id: "user-1",
      email: "super@example.com",
      isSuperAdmin: true,
      status: "active",
    },
    currentOrganization: { id: activeOrganization.id, name: activeOrganization.name },
    role: { id: "role-1", key: "owner", name: "所有者" },
    permissions: [],
    session: { id: "session-1", clientType: "web_pc" },
    status: "authenticated",
  });
  const menuStore = createMenuStore();
  const session = {
    authApi: {
      listOrganizations: vi.fn().mockResolvedValue(organizations),
    },
    authStore,
    iamApi: {
      getAuthorizedMenus: vi.fn().mockResolvedValue([]),
      resetOrganizationMenus: vi.fn().mockResolvedValue(undefined),
    },
    menuStore,
  } as unknown as WebSessionDependency;

  render(
    <AppProviders>
      <MenuResetPage session={session} />
    </AppProviders>,
  );

  return { session };
}

async function selectOrganization(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("combobox", { name: "目标组织" }));
  await user.click(screen.getByRole("option", { name }));
}

describe("MenuResetPage", () => {
  it("requires an explicit organization selection before reset is available", async () => {
    createHarness();

    expect(await screen.findByRole("combobox", { name: "目标组织" })).toHaveTextContent(
      "请选择组织",
    );
    expect(screen.getByRole("button", { name: "恢复默认菜单" })).toBeDisabled();
  });

  it("names the selected target in confirmation and cancellation sends no request", async () => {
    const user = userEvent.setup();
    const { session } = createHarness();

    await selectOrganization(user, "家庭账本");
    await user.click(screen.getByRole("button", { name: "恢复默认菜单" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("家庭账本");
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(session.iamApi.resetOrganizationMenus).not.toHaveBeenCalled();
  });

  it("invalidates an old same-organization request before loading fresh active-target menus", async () => {
    const user = userEvent.setup();
    const { session } = createHarness();
    const oldMenus = [authorizedMenu(1, "旧菜单")];
    const freshMenus = [authorizedMenu(2, "新菜单")];
    const oldRequest = deferred<AuthorizedMenuNode[]>();
    vi.mocked(session.iamApi.getAuthorizedMenus)
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(freshMenus);
    const oldLoad = session.menuStore
      .getState()
      .loadMenusForOrganization(activeOrganization.id, session.iamApi.getAuthorizedMenus);

    await selectOrganization(user, "个人账本");
    await user.click(screen.getByRole("button", { name: "恢复默认菜单" }));
    await user.click(screen.getByRole("button", { name: "确认恢复" }));

    await waitFor(() => expect(session.iamApi.getAuthorizedMenus).toHaveBeenCalledTimes(2));
    expect(session.menuStore.getState().tree).toEqual(freshMenus);

    oldRequest.resolve(oldMenus);
    await oldLoad;

    expect(session.menuStore.getState().tree).toEqual(freshMenus);
  });

  it("does not clear or reload active menus after resetting another organization", async () => {
    const user = userEvent.setup();
    const { session } = createHarness();
    const activeMenus = [authorizedMenu(1, "当前菜单")];
    vi.mocked(session.iamApi.getAuthorizedMenus).mockResolvedValue(activeMenus);
    await session.menuStore
      .getState()
      .loadMenusForOrganization(activeOrganization.id, session.iamApi.getAuthorizedMenus);
    const clearMenus = vi.spyOn(session.menuStore.getState(), "clearMenus");

    await selectOrganization(user, "家庭账本");
    await user.click(screen.getByRole("button", { name: "恢复默认菜单" }));
    await user.click(screen.getByRole("button", { name: "确认恢复" }));

    await waitFor(() =>
      expect(session.iamApi.resetOrganizationMenus).toHaveBeenCalledWith(otherOrganization.id),
    );
    expect(clearMenus).not.toHaveBeenCalled();
    expect(session.iamApi.getAuthorizedMenus).toHaveBeenCalledTimes(1);
    expect(session.menuStore.getState()).toMatchObject({
      organizationId: activeOrganization.id,
      status: "ready",
      tree: activeMenus,
    });
  });

  it("disables confirmation and sends one request while reset is pending", async () => {
    const user = userEvent.setup();
    const { session } = createHarness();
    const resetRequest = deferred<void>();
    vi.mocked(session.iamApi.resetOrganizationMenus).mockReturnValueOnce(resetRequest.promise);

    await selectOrganization(user, "家庭账本");
    await user.click(screen.getByRole("button", { name: "恢复默认菜单" }));
    const confirmButton = screen.getByRole("button", { name: "确认恢复" });
    await user.click(confirmButton);

    expect(confirmButton).toBeDisabled();
    await user.click(confirmButton);
    expect(session.iamApi.resetOrganizationMenus).toHaveBeenCalledTimes(1);

    resetRequest.resolve();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("retains the selected organization when reset fails", async () => {
    const user = userEvent.setup();
    const { session } = createHarness();
    vi.mocked(session.iamApi.resetOrganizationMenus).mockRejectedValueOnce(
      new Error("reset unavailable"),
    );

    await selectOrganization(user, "家庭账本");
    await user.click(screen.getByRole("button", { name: "恢复默认菜单" }));
    await user.click(screen.getByRole("button", { name: "确认恢复" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("恢复菜单失败，请稍后重试。");
    expect(screen.getByRole("combobox", { name: "目标组织" })).toHaveTextContent("家庭账本");
  });
});
