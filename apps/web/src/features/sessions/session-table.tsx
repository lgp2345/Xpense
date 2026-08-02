import { AlertDialog } from "@heroui/react/alert-dialog";
import { Button } from "@heroui/react/button";
import { Table } from "@heroui/react/table";
import type { ClientType } from "@xpense/shared";

import type { SessionResponse } from "../../services/auth-api";

export type SessionListItem = Pick<
  SessionResponse,
  "clientType" | "id" | "lastUsedAt" | "status"
> & {
  deviceName?: string;
};

type SessionTableProps = {
  currentSessionId?: string;
  isMutating: boolean;
  canRevoke: boolean;
  sessions: SessionListItem[];
  onRevoke: (sessionId: string) => Promise<void>;
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SessionTable({
  canRevoke,
  currentSessionId,
  isMutating,
  sessions,
  onRevoke,
}: SessionTableProps) {
  if (sessions.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--color-ink-muted)]">
        当前没有可管理的会话。
      </p>
    );
  }

  return (
    <Table className="overflow-hidden rounded-[var(--xp-radius-card)] bg-[var(--color-surface-solid)]">
      <Table.ScrollContainer>
        <Table.Content aria-label="会话列表">
          <Table.Header>
            <Table.Column isRowHeader>设备类型</Table.Column>
            <Table.Column>设备名称</Table.Column>
            <Table.Column>最近使用</Table.Column>
            <Table.Column>状态</Table.Column>
            <Table.Column>设备标记</Table.Column>
            <Table.Column>操作</Table.Column>
          </Table.Header>
          <Table.Body items={sessions}>
            {(session) => {
              const isCurrent = session.id === currentSessionId;
              const canRevokeSession = canRevoke && session.status === "active";

              return (
                <Table.Row id={session.id}>
                  <Table.Cell>{getClientTypeLabel(session.clientType)}</Table.Cell>
                  <Table.Cell>{session.deviceName ?? "未命名设备"}</Table.Cell>
                  <Table.Cell>{formatLastUsedAt(session.lastUsedAt)}</Table.Cell>
                  <Table.Cell>{session.status === "active" ? "有效" : "已撤销"}</Table.Cell>
                  <Table.Cell>{isCurrent ? "当前设备" : ""}</Table.Cell>
                  <Table.Cell>
                    {canRevokeSession ? (
                      <AlertDialog>
                        <AlertDialog.Trigger className="inline-flex min-h-10 items-center justify-center rounded-[var(--xp-radius-control)] px-3 text-sm text-[var(--color-error)] outline outline-1 outline-[var(--color-line-strong)]">
                          撤销 {session.id}
                        </AlertDialog.Trigger>
                        <AlertDialog.Backdrop>
                          <AlertDialog.Container size="sm">
                            <AlertDialog.Dialog>
                              <AlertDialog.Header>
                                <AlertDialog.Heading>确认撤销会话</AlertDialog.Heading>
                              </AlertDialog.Header>
                              <AlertDialog.Body>
                                撤销后，该设备需要重新登录才能继续访问。
                              </AlertDialog.Body>
                              <AlertDialog.Footer>
                                <Button slot="close" variant="secondary">
                                  取消
                                </Button>
                                <Button
                                  isDisabled={isMutating}
                                  slot="close"
                                  onPress={() => void onRevoke(session.id)}
                                >
                                  确认撤销
                                </Button>
                              </AlertDialog.Footer>
                            </AlertDialog.Dialog>
                          </AlertDialog.Container>
                        </AlertDialog.Backdrop>
                      </AlertDialog>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              );
            }}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function formatLastUsedAt(lastUsedAt: string | null): string {
  return lastUsedAt ? dateTimeFormatter.format(new Date(lastUsedAt)) : "暂无记录";
}

function getClientTypeLabel(clientType: ClientType): string {
  const labels: Record<ClientType, string> = {
    app_android: "Android 应用",
    app_ios: "iOS 应用",
    web_mobile: "移动浏览器",
    web_pc: "桌面浏览器",
  };

  return labels[clientType];
}
