import type { PermissionKey } from "@xpense/shared";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

  const canRevoke = permissions.includes("sessions:revoke");

  return (
    <main className="space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">会话管理</h1>
          <p className="text-sm text-muted-foreground">账号安全</p>
        </div>
        {canRevoke ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button>撤销全部会话</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认撤销全部会话</AlertDialogTitle>
                <AlertDialogDescription>
                  撤销后，所有设备都需要重新登录才能继续访问。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction disabled={isMutating} onClick={() => void handleRevokeAll()}>
                  确认全部撤销
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </header>

      {error ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <span>{error.message}</span>
          <Button size="sm" variant="outline" onClick={() => void handleRetry()}>
            {error.retryLabel}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-4" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <span className="sr-only">正在加载会话...</span>
          </CardContent>
        </Card>
      ) : (
        <SessionTable
          canRevoke={canRevoke}
          currentSessionId={currentSessionId}
          isMutating={isMutating}
          sessions={sessionItems}
          onRevoke={handleRevoke}
        />
      )}
    </main>
  );
}
