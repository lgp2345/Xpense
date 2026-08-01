import { Button } from "@heroui/react/button";
import { SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import type { ClientType } from "@xpense/shared";
import { useEffect, useState } from "react";
import { useStore } from "zustand";

import {
  logoutWebSession,
  switchWebOrganization,
  type WebSessionDependency,
  webSession,
} from "../../services/web-session";
import { type OrganizationOption, OrganizationSwitcher } from "./organization-switcher";
import styles from "./user-header.module.css";

type UserHeaderProps = {
  session?: WebSessionDependency;
};

const clientTypeLabels: Record<ClientType, string> = {
  app_android: "Android 应用",
  app_ios: "iOS 应用",
  web_mobile: "移动网页",
  web_pc: "网页端",
};

export function UserHeader({ session = webSession }: UserHeaderProps) {
  const { authApi, authStore: store } = session;
  const currentOrganization = useStore(store, (state) => state.currentOrganization);
  const currentUser = useStore(store, (state) => state.currentUser);
  const role = useStore(store, (state) => state.role);
  const currentSession = useStore(store, (state) => state.session);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const currentOrganizationId = currentOrganization?.id ?? null;

  useEffect(() => {
    if (!currentOrganizationId) {
      setOrganizations([]);
      setIsLoadingOrganizations(false);
      return;
    }

    let isActive = true;

    void authApi
      .listOrganizations()
      .then((items) => {
        if (isActive) {
          setOrganizations(items.map(({ id, name }) => ({ id, name })));
        }
      })
      .catch(() => {
        if (isActive) {
          setErrorMessage("暂时无法加载可用组织，请稍后重试。");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingOrganizations(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [authApi, currentOrganizationId]);

  const availableOrganizations = currentOrganization
    ? organizations.some((organization) => organization.id === currentOrganization.id)
      ? organizations
      : [currentOrganization, ...organizations]
    : [];

  async function handleOrganizationSwitch(organizationId: string) {
    setErrorMessage(null);
    setIsSwitching(true);

    try {
      await switchWebOrganization(authApi, store, organizationId);
    } catch {
      setErrorMessage("切换组织失败，请稍后重试。");
    } finally {
      setIsSwitching(false);
    }
  }

  async function handleLogout() {
    setErrorMessage(null);
    setIsLoggingOut(true);

    try {
      await logoutWebSession(authApi, store);
    } catch {
      setErrorMessage("退出登录失败，请稍后重试。");
    } finally {
      setIsLoggingOut(false);
    }
  }

  const clientType = currentSession ? clientTypeLabels[currentSession.clientType] : "未知客户端";

  return (
    <section aria-label="当前用户与组织" className={styles.userHeader}>
      <div className={styles.identity}>
        <span className={styles.identityLabel}>当前组织</span>
        <strong className={styles.organizationName} title={currentOrganization?.name}>
          {currentOrganization?.name ?? "未选择组织"}
        </strong>
        <span className={styles.email}>{currentUser?.email ?? "未登录"}</span>
      </div>

      <div className={styles.context}>
        <span>角色：{role?.name ?? "未分配"}</span>
        <span>
          会话客户端：{clientType}
          {currentSession ? `（${currentSession.clientType}）` : ""}
        </span>
      </div>

      <OrganizationSwitcher
        currentOrganizationId={currentOrganizationId}
        isDisabled={!currentOrganizationId || isLoadingOrganizations || isSwitching || isLoggingOut}
        organizations={availableOrganizations}
        onSwitch={handleOrganizationSwitch}
      />

      <Button
        className={styles.logoutButton}
        isDisabled={isLoggingOut || isSwitching}
        onPress={handleLogout}
      >
        <SignOut aria-hidden="true" size={18} />
        {isLoggingOut ? "正在退出..." : "退出登录"}
      </Button>

      {errorMessage ? (
        <p className={styles.errorMessage} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
