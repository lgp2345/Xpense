import { QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserResponse, OrganizationDetail } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import {
  createWebSession,
  logoutWebSession,
  returnWebSessionToPlatform,
} from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { OrganizationDetailPage } from "./organization-detail-page";
import { OrganizationListPage } from "./organization-list-page";

const organization: OrganizationDetail = {
  id: "org",
  name: "美元组织",
  baseCurrency: "USD",
  timezone: "Asia/Shanghai",
  status: "active",
  contactName: null,
  contactPhone: null,
  address: null,
  owners: [{ userId: "owner", phone: "13800000001", email: null }],
};
const platform: CurrentUserResponse = {
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
function harness() {
  const store = createAuthStore({ accessToken: "platform-token" });
  store.getState().setCurrentUserContext(platform);
  const session = createWebSession({ authStore: store });
  vi.spyOn(session.organizationsApi, "list").mockResolvedValue({
    items: [organization],
    page: 1,
    pageSize: 20,
    total: 21,
  });
  vi.spyOn(session.organizationsApi, "detail").mockResolvedValue(organization);
  vi.spyOn(session.iamApi, "getAuthorizedMenus").mockResolvedValue([]);
  return { store, session };
}
function show(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<AppProviders queryClient={client}>{ui}</AppProviders>);
}
function deferred<T>() {
  let resolve = (_value: T) => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
describe("platform organization workflow", () => {
  it("renders organization, currency and owners, and updates URL-driven pagination", async () => {
    const h = harness(),
      onQueryChange = vi.fn(),
      onDetail = vi.fn();
    show(
      <OrganizationListPage
        session={h.session}
        query={{ page: 1, pageSize: 20 }}
        onQueryChange={onQueryChange}
        onDetail={onDetail}
        onEntered={vi.fn()}
      />,
    );
    expect(await screen.findByText("美元组织")).toBeVisible();
    expect(screen.getByText("USD")).toBeVisible();
    expect(screen.getByText("13800000001")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "详情" }));
    expect(onDetail).toHaveBeenCalledWith("org");
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(onQueryChange).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
    expect(h.session.iamApi.getAuthorizedMenus).not.toHaveBeenCalled();
  });
  it.each(["empty", "error"])("renders the %s state", async (state) => {
    const h = harness();
    if (state === "empty")
      vi.mocked(h.session.organizationsApi.list).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });
    else vi.mocked(h.session.organizationsApi.list).mockRejectedValue(new Error("offline"));
    show(
      <OrganizationListPage
        session={h.session}
        query={{ page: 1, pageSize: 20 }}
        onQueryChange={vi.fn()}
        onDetail={vi.fn()}
        onEntered={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(
        state === "empty" ? "暂无符合条件的组织" : "加载组织失败，请稍后重试。",
      ),
    ).toBeVisible();
  });
  it("enters the target with a null member role and can return to a menu-free platform scope", async () => {
    const h = harness(),
      onEntered = vi.fn();
    vi.spyOn(h.session.authApi, "switchOrganization").mockResolvedValue({
      accessToken: "org-token",
    });
    vi.spyOn(h.session.authApi, "getCurrentUser")
      .mockResolvedValue({ ...platform, accessScope: "organization", organization, role: null })
      .mockResolvedValueOnce({ ...platform, accessScope: "organization", organization, role: null })
      .mockResolvedValueOnce(platform);
    vi.spyOn(h.session.authApi, "returnToPlatform").mockResolvedValue({
      accessToken: "new-platform-token",
    });
    show(
      <OrganizationDetailPage
        session={h.session}
        organizationId="org"
        onBack={vi.fn()}
        onEntered={onEntered}
      />,
    );
    expect(await screen.findByText("名称、基础币种和时区在创建后不可修改。")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "进入组织" }));
    await waitFor(() => expect(onEntered).toHaveBeenCalledOnce());
    expect(h.store.getState()).toMatchObject({
      accessScope: "organization",
      currentOrganization: { id: "org" },
      role: null,
    });
    await act(() => returnWebSessionToPlatform(h.session));
    expect(h.store.getState()).toMatchObject({
      accessScope: "platform",
      currentOrganization: null,
      role: null,
    });
    expect(h.session.menuStore.getState().organizationId).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "进入组织" }));
    await waitFor(() => expect(onEntered).toHaveBeenCalledTimes(2));
    expect(h.store.getState().currentOrganization?.id).toBe("org");
  });
  it("ignores a delayed enter response after logout", async () => {
    const h = harness(),
      onEntered = vi.fn(),
      pending = deferred<{ accessToken: string }>();
    vi.spyOn(h.session.authApi, "switchOrganization").mockReturnValue(pending.promise);
    vi.spyOn(h.session.authApi, "logout").mockResolvedValue();
    const getUser = vi.spyOn(h.session.authApi, "getCurrentUser");
    show(
      <OrganizationDetailPage
        session={h.session}
        organizationId="org"
        onBack={vi.fn()}
        onEntered={onEntered}
      />,
    );
    await screen.findByRole("button", { name: "进入组织" });
    await userEvent.click(screen.getByRole("button", { name: "进入组织" }));
    await act(() => logoutWebSession(h.session.authApi, h.store, h.session));
    await act(async () => {
      pending.resolve({ accessToken: "late" });
      await pending.promise;
    });
    expect(h.store.getState().status).toBe("anonymous");
    expect(onEntered).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });
});
