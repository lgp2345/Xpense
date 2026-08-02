import { AlertDialog } from "@heroui/react/alert-dialog";
import { Button } from "@heroui/react/button";
import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";

import type { AuthApi } from "../../services/auth-api";
import { webAuthApi } from "../../services/web-session";
import { type SessionListItem, SessionTable } from "./session-table";

type SessionsApi = Pick<AuthApi, "listSessions" | "revokeAllSessions" | "revokeSession">;

type SessionsPageProps = {
  api?: SessionsApi;
  currentSessionId?: string;
  onCurrentSessionRevoked?: () => void;
  permissions: PermissionKey[];
  sessions?: SessionListItem[];
};

type PageError = {
  message: string;
  retryLabel: "刷新列表" | "重试";
};

export function SessionsPage({
  api = webAuthApi,
  currentSessionId,
  onCurrentSessionRevoked,
  permissions,
  sessions,
}: SessionsPageProps) {
  const hasInitialSessions = sessions !== undefined;
  const [sessionItems, setSessionItems] = useState(() => sessions ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialSessions);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<PageError | null>(null);

  async function refreshSessions() {
    const nextSessions = await api.listSessions();
    setSessionItems(nextSessions);
  }

  useEffect(() => {
    if (hasInitialSessions) {
      return;
    }

    let isActive = true;

    void api
      .listSessions()
      .then((nextSessions) => {
        if (isActive) {
          setSessionItems(nextSessions);
        }
      })
      .catch(() => {
        if (isActive) {
          setError({ message: "加载会话列表失败，请稍后重试。", retryLabel: "重试" });
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [api, hasInitialSessions]);

  async function runMutation(
    operation: () => Promise<void>,
    mutationError: string,
    refreshError: string,
    endsCurrentSession: boolean,
  ) {
    setError(null);
    setIsMutating(true);

    try {
      try {
        await operation();
      } catch {
        setError({ message: mutationError, retryLabel: "刷新列表" });
        return;
      }

      if (endsCurrentSession) {
        onCurrentSessionRevoked?.();
        return;
      }

      try {
        await refreshSessions();
      } catch {
        setError({ message: refreshError, retryLabel: "刷新列表" });
      }
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRevoke(sessionId: string) {
    await runMutation(
      () => api.revokeSession(sessionId),
      "撤销会话失败，请稍后刷新列表。",
      "会话已撤销，但列表刷新失败，请稍后刷新。",
      sessionId === currentSessionId,
    );
  }

  async function handleRevokeAll() {
    await runMutation(
      () => api.revokeAllSessions(),
      "撤销全部会话失败，请稍后刷新列表。",
      "全部会话已撤销，但列表刷新失败，请稍后刷新。",
      true,
    );
  }

  async function handleRetry() {
    setError(null);
    setIsLoading(true);

    try {
      await refreshSessions();
    } catch {
      setError({ message: "加载会话列表失败，请稍后重试。", retryLabel: "重试" });
    } finally {
      setIsLoading(false);
    }
  }

  const canRevoke = permissions.includes("sessions.revoke");

  return (
    <main className="min-h-[100dvh] bg-[var(--color-canvas)] p-4 text-[var(--color-ink)] sm:p-8">
      <section className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--color-ink-muted)]">账号安全</p>
            <h1 className="mt-1 text-3xl font-normal">会话管理</h1>
          </div>
          {canRevoke ? (
            <AlertDialog>
              <AlertDialog.Trigger className="inline-flex min-h-10 items-center justify-center rounded-[var(--xp-radius-pill)] bg-[var(--color-ink)] px-4 text-sm text-[var(--color-surface-solid)]">
                撤销全部会话
              </AlertDialog.Trigger>
              <AlertDialog.Backdrop>
                <AlertDialog.Container size="sm">
                  <AlertDialog.Dialog>
                    <AlertDialog.Header>
                      <AlertDialog.Heading>确认撤销全部会话</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                      撤销后，所有设备都需要重新登录才能继续访问。
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                      <Button slot="close" variant="secondary">
                        取消
                      </Button>
                      <Button
                        isDisabled={isMutating}
                        slot="close"
                        onPress={() => void handleRevokeAll()}
                      >
                        确认全部撤销
                      </Button>
                    </AlertDialog.Footer>
                  </AlertDialog.Dialog>
                </AlertDialog.Container>
              </AlertDialog.Backdrop>
            </AlertDialog>
          ) : null}
        </header>

        {error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3" role="alert">
            <span>{error.message}</span>
            <Button variant="secondary" onPress={() => void handleRetry()}>
              {error.retryLabel}
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <p aria-live="polite" className="py-10 text-sm text-[var(--color-ink-muted)]">
            正在加载会话...
          </p>
        ) : (
          <SessionTable
            canRevoke={canRevoke}
            currentSessionId={currentSessionId}
            isMutating={isMutating}
            sessions={sessionItems}
            onRevoke={handleRevoke}
          />
        )}
      </section>
    </main>
  );
}
