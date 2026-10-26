import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { AppProviders } from "@/components/app-providers";
import { ChangePasswordPage } from "@/features/auth/change-password-page";
import { PeriodBillPreview } from "@/features/rental/bills/period-bill-preview";
import { LoginPage } from "@/pages/login-page";
import {
  createWebSession,
  logoutWebSession,
  restoreWebSession,
  switchWebOrganization,
} from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { OrganizationCurrencyProvider } from "./organization-currency";

const periodPreview = {
  period: { periodStart: "2026-10-01", periodEnd: "2026-10-31" },
  amountMinor: 101,
  lines: [
    {
      kind: "rent_period",
      label: "租金",
      sortOrder: 0,
      amountMinor: 101,
      coveredDays: 31,
      referenceDays: 31,
      baseRentAmountMinor: 101,
    },
  ],
  missingFields: [],
} as never;

function context(currency = "CNY", changed = false) {
  return {
    accessScope: "organization" as const,
    user: {
      id: "owner",
      phone: "13800000001",
      email: null,
      isSuperAdmin: false,
      status: "active" as const,
      initialPasswordUnchanged: !changed,
    },
    organization: {
      id: currency,
      name: `${currency}组织`,
      baseCurrency: currency,
      timezone: "Asia/Shanghai",
      status: "active" as const,
    },
    role: { id: "owner-role", key: "owner", name: "组织负责人" },
    permissions: ["rental_properties:read" as const],
    session: {
      id: changed ? "password-session" : `credential-${currency}`,
      clientType: "web_pc" as const,
    },
  };
}
describe("组织用户界面生命周期", () => {
  it("allows business while a credential notice is visible, switches currency and replaces the session through the shared password action", async () => {
    const user = userEvent.setup();
    const session = createWebSession({ authStore: createAuthStore() });
    let currency = "CNY",
      changed = false;
    Object.assign(session.authApi, {
      getCaptcha: vi.fn().mockResolvedValue({ captchaId: "test", svg: "<svg/>" }),
      login: vi.fn().mockResolvedValue({ accessToken: "credential-token" }),
      getCurrentUser: vi.fn().mockImplementation(async () => context(currency, changed)),
      switchOrganization: vi.fn().mockImplementation(async (id) => {
        currency = id;
        return { accessToken: "switch-token" };
      }),
      changePassword: vi.fn().mockImplementation(async () => {
        changed = true;
        return { accessToken: "password-token" };
      }),
    });
    Object.assign(session.iamApi, { getAuthorizedMenus: vi.fn().mockResolvedValue([]) });
    function Lifecycle() {
      const [stage, setStage] = useState("login");
      const organization = useStore(session.authStore, (s) => s.currentOrganization);
      return (
        <OrganizationCurrencyProvider currencyCode={organization?.baseCurrency ?? null}>
          {stage === "login" ? (
            <LoginPage
              session={session}
              onAuthenticated={() => setStage("rental")}
              onChangePassword={() => setStage("password")}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  void switchWebOrganization(session.authApi, session.authStore, "USD", session)
                }
              >
                切换美元组织
              </button>
              <button type="button" onClick={() => setStage("rental")}>
                访问租赁业务
              </button>
              {stage === "password" ? (
                <ChangePasswordPage session={session} />
              ) : (
                <PeriodBillPreview preview={periodPreview} />
              )}
            </>
          )}
        </OrganizationCurrencyProvider>
      );
    }
    render(
      <AppProviders>
        <Lifecycle />
      </AppProviders>,
    );
    await user.type(screen.getByLabelText("手机号"), "13800000001");
    await user.type(screen.getByLabelText("密码"), "custom-initial");
    await user.type(screen.getByLabelText("验证码"), "test");
    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByText("您尚未修改初始密码，请及时修改。")).toBeInTheDocument();
    expect(await screen.findByText("应收 ¥1.01")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "切换美元组织" }));
    expect(await screen.findByText("应收 $1.01")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "修改密码" }));
    for (const [name, value] of [
      ["当前密码", "custom-initial"],
      ["新密码", "next-password"],
      ["确认新密码", "next-password"],
    ])
      await user.type(screen.getByLabelText(name as string), value as string);
    await user.click(screen.getByRole("button", { name: "保存新密码" }));
    await waitFor(() => expect(session.authStore.getState().accessToken).toBe("password-token"));
    expect(session.authStore.getState().currentOrganization?.baseCurrency).toBe("USD");
    expect(session.authStore.getState().currentUser?.initialPasswordUnchanged).toBe(false);
    await user.click(screen.getByRole("button", { name: "访问租赁业务" }));
    expect(await screen.findByText("应收 $1.01")).toBeInTheDocument();
  });
  it("does not revive a logged-out account when startup restoration returns late", async () => {
    let finish!: (value: { accessToken: string }) => void;
    const pending = new Promise<{ accessToken: string }>((resolve) => {
      finish = resolve;
    });
    const session = createWebSession({ authStore: createAuthStore() });
    Object.assign(session.authApi, {
      refresh: vi.fn().mockReturnValue(pending),
      getCurrentUser: vi.fn().mockResolvedValue(context()),
      logout: vi.fn().mockResolvedValue(undefined),
    });
    Object.assign(session.iamApi, { getAuthorizedMenus: vi.fn().mockResolvedValue([]) });
    let restore: Promise<boolean>;
    function Restore() {
      const status = useStore(session.authStore, (s) => s.status);
      useEffect(() => {
        restore = restoreWebSession(session.authApi, session.authStore, session);
      }, []);
      return (
        <>
          <p>{status}</p>
          <button
            type="button"
            onClick={() => {
              void logoutWebSession(session.authApi, session.authStore, session);
            }}
          >
            退出
          </button>
        </>
      );
    }
    render(<Restore />);
    await userEvent.click(screen.getByRole("button", { name: "退出" }));
    await act(async () => {
      finish({ accessToken: "late-token" });
      await restore;
    });
    expect(screen.getByText("anonymous")).toBeInTheDocument();
    expect(session.authStore.getState().accessToken).toBeNull();
  });
});
