import { Table } from "@heroui/react/table";

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
    return (
      <p className="py-10 text-center text-sm text-[var(--color-ink-muted)]">
        没有匹配的审计日志。
      </p>
    );
  }

  return (
    <Table className="overflow-hidden rounded-[var(--xp-radius-card)] bg-[var(--color-surface-solid)]">
      <Table.ScrollContainer>
        <Table.Content aria-label="审计日志列表">
          <Table.Header>
            <Table.Column isRowHeader>发生时间</Table.Column>
            <Table.Column>操作</Table.Column>
            <Table.Column>操作人 ID</Table.Column>
            <Table.Column>目标类型</Table.Column>
            <Table.Column>目标 ID</Table.Column>
            <Table.Column>结果</Table.Column>
            <Table.Column>元数据摘要</Table.Column>
          </Table.Header>
          <Table.Body items={logs}>
            {(log) => (
              <Table.Row id={log.id}>
                <Table.Cell>{dateTimeFormatter.format(new Date(log.createdAt))}</Table.Cell>
                <Table.Cell>{log.action}</Table.Cell>
                <Table.Cell>{log.actorUserId ?? "系统"}</Table.Cell>
                <Table.Cell>{log.targetType}</Table.Cell>
                <Table.Cell>{log.targetId ?? "—"}</Table.Cell>
                <Table.Cell>{log.result === "succeeded" ? "成功" : "失败"}</Table.Cell>
                <Table.Cell>{getMetadataSummary(log.metadata)}</Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
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

  if (value !== null && typeof value === "object") {
    return "已记录";
  }

  return "已记录";
}
