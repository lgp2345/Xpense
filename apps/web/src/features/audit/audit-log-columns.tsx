import type { ColumnDef } from "@tanstack/react-table";
import type { AuditLogRecord } from "../../services/iam-api";
import type { auditTableFeatures } from "./audit-log-table";

type AuditLogColumnDef = ColumnDef<typeof auditTableFeatures, AuditLogRecord>;

export function createAuditLogColumns(): AuditLogColumnDef[] {
  return [
    {
      accessorKey: "createdAt",
      header: () => <span>发生时间</span>,
      cell: ({ row }) => (
        <span className="font-medium">
          {dateTimeFormatter.format(new Date(row.original.createdAt))}
        </span>
      ),
    },
    {
      accessorKey: "action",
      header: () => <span>操作</span>,
    },
    {
      accessorKey: "actorUserId",
      header: () => <span>操作人 ID</span>,
      cell: ({ row }) => row.original.actorUserId ?? "系统",
    },
    {
      accessorKey: "targetType",
      header: () => <span>目标类型</span>,
    },
    {
      accessorKey: "targetId",
      header: () => <span>目标 ID</span>,
      cell: ({ row }) => row.original.targetId ?? "—",
    },
    {
      accessorKey: "result",
      header: () => <span>结果</span>,
      cell: ({ row }) => (row.original.result === "succeeded" ? "成功" : "失败"),
    },
    {
      accessorKey: "metadata",
      header: () => <span>元数据摘要</span>,
      cell: ({ row }) => getMetadataSummary(row.original.metadata),
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
