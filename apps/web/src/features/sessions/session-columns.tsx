import type { ColumnDef } from "@tanstack/react-table";
import type { ClientType } from "@xpense/shared";
import { DataTableColumnHeader } from "@/components/data-table";
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
import type { SessionListItem } from "./session-table";

type SessionColumnsOptions = {
  canRevoke: boolean;
  currentSessionId?: string;
  isMutating: boolean;
  onRevoke: (sessionId: string) => Promise<void>;
};

// biome-ignore lint/suspicious/noExplicitAny: ColumnDef needs features type, using any for flexibility
type SessionColumnDef = ColumnDef<any, SessionListItem>;

export function createSessionColumns({
  canRevoke,
  currentSessionId,
  isMutating,
  onRevoke,
}: SessionColumnsOptions): SessionColumnDef[] {
  return [
    {
      accessorKey: "clientType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="设备类型" />,
      cell: ({ row }) => (
        <span className="font-medium">{getClientTypeLabel(row.original.clientType)}</span>
      ),
    },
    {
      accessorKey: "deviceName",
      header: () => <span>设备名称</span>,
      cell: ({ row }) => row.original.deviceName ?? "未命名设备",
    },
    {
      accessorKey: "lastUsedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="最近使用" />,
      cell: ({ row }) => formatLastUsedAt(row.original.lastUsedAt),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="状态" />,
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "default" : "secondary"}>
          {row.original.status === "active" ? "有效" : "已撤销"}
        </Badge>
      ),
      filterFn: (row, _columnId, filterValue: unknown) => {
        if (!filterValue) return true;
        return row.original.status === filterValue;
      },
    },
    {
      id: "isCurrent",
      header: () => <span>设备标记</span>,
      cell: ({ row }) => (row.original.id === currentSessionId ? "当前设备" : ""),
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => {
        const session = row.original;
        const canRevokeSession = canRevoke && session.status === "active";
        return (
          <div className="text-right">
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
          </div>
        );
      },
      enableSorting: false,
    },
  ];
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
