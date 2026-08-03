import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditLogRecord } from "../../services/iam-api";

type AuditLogTableProps = {
  logs: AuditLogRecord[];
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AuditLogTable({ logs }: AuditLogTableProps) {
  if (logs.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">没有匹配的审计日志。</p>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>发生时间</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>操作人 ID</TableHead>
              <TableHead>目标类型</TableHead>
              <TableHead>目标 ID</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>元数据摘要</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-medium">
                  {dateTimeFormatter.format(new Date(log.createdAt))}
                </TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.actorUserId ?? "系统"}</TableCell>
                <TableCell>{log.targetType}</TableCell>
                <TableCell>{log.targetId ?? "—"}</TableCell>
                <TableCell>{log.result === "succeeded" ? "成功" : "失败"}</TableCell>
                <TableCell>{getMetadataSummary(log.metadata)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function getMetadataSummary(metadata: Record<string, unknown>): string {
  const safeEntries = Object.entries(metadata).filter(([key]) => !isSensitiveKey(key));

  if (safeEntries.length === 0) {
    return "无";
  }

  return safeEntries.map(([key, value]) => `${key}: ${getValueSummary(value)}`).join("；");
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|password|authorization|cookie/i.test(key);
}

function getValueSummary(value: unknown): string {
  if (Array.isArray(value)) {
    return `${value.length} 项`;
  }

  return "已记录";
}
