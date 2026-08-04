import type { ColumnDef } from "@tanstack/react-table";

import { DataTableColumnHeader } from "@/components/data-table";
import type { AuditLogRecord } from "../../services/iam-api";

// biome-ignore lint/suspicious/noExplicitAny: ColumnDef needs features type, using any for flexibility
type AuditLogColumnDef = ColumnDef<any, AuditLogRecord>;

export function createAuditLogColumns(): AuditLogColumnDef[] {
  return [
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="发生时间" />,
      cell: ({ row }) => (
        <span className="font-medium">
          {dateTimeFormatter.format(new Date(row.original.createdAt))}
        </span>
      ),
    },
    {
      accessorKey: "action",
      header: ({ column }) => <DataTableColumnHeader column={column} title="操作" />,
    },
    {
      accessorKey: "actorUserId",
      header: () => <span>操作人 ID</span>,
      cell: ({ row }) => row.original.actorUserId ?? "系统",
    },
    {
      accessorKey: "targetType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="目标类型" />,
    },
    {
      accessorKey: "targetId",
      header: () => <span>目标 ID</span>,
      cell: ({ row }) => row.original.targetId ?? "—",
    },
    {
      accessorKey: "result",
      header: ({ column }) => <DataTableColumnHeader column={column} title="结果" />,
      cell: ({ row }) => (row.original.result === "succeeded" ? "成功" : "失败"),
      filterFn: (row, _columnId, filterValue: unknown) => {
        if (!filterValue) return true;
        return row.original.result === filterValue;
      },
    },
    {
      accessorKey: "metadata",
      header: () => <span>元数据摘要</span>,
      cell: ({ row }) => getMetadataSummary(row.original.metadata),
      enableSorting: false,
    },
  ];
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getMetadataSummary(metadata: Record<string, unknown>): string {
  const safeEntries = Object.entries(metadata).filter(([key]) => !isSensitiveKey(key));
  if (safeEntries.length === 0) return "无";
  return safeEntries.map(([key, value]) => `${key}: ${getValueSummary(value)}`).join("；");
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|password|authorization|cookie/i.test(key);
}

function getValueSummary(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} 项`;
  return "已记录";
}
