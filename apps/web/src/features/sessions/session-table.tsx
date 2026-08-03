import type { ClientType } from "@xpense/shared";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SessionResponse } from "../../services/auth-api";

export type SessionListItem = Pick<
  SessionResponse,
  "clientType" | "id" | "lastUsedAt" | "status"
> & {
  deviceName?: string;
};

type SessionTableProps = {
  canRevoke: boolean;
  currentSessionId?: string;
  isMutating: boolean;
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
      <p className="py-10 text-center text-sm text-muted-foreground">当前没有可管理的会话。</p>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>设备类型</TableHead>
              <TableHead>设备名称</TableHead>
              <TableHead>最近使用</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>设备标记</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              const canRevokeSession = canRevoke && session.status === "active";

              return (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">
                    {getClientTypeLabel(session.clientType)}
                  </TableCell>
                  <TableCell>{session.deviceName ?? "未命名设备"}</TableCell>
                  <TableCell>{formatLastUsedAt(session.lastUsedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={session.status === "active" ? "default" : "secondary"}>
                      {session.status === "active" ? "有效" : "已撤销"}
                    </Badge>
                  </TableCell>
                  <TableCell>{isCurrent ? "当前设备" : ""}</TableCell>
                  <TableCell className="text-right">
                    {canRevokeSession ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline">撤销 {session.id}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认撤销会话</AlertDialogTitle>
                            <AlertDialogDescription>
                              撤销后，该设备需要重新登录才能继续访问。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={isMutating}
                              onClick={() => void onRevoke(session.id)}
                            >
                              确认撤销
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
