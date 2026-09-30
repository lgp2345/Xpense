import { createHash } from "node:crypto";

type FinanceRequestRecord = {
  organizationId: string;
  contractId: string;
  action: string;
  requestHash: string;
};

export function isFinanceRequestReplay(
  record: FinanceRequestRecord,
  expected: FinanceRequestRecord,
): boolean {
  return (
    record.organizationId === expected.organizationId &&
    record.contractId === expected.contractId &&
    record.action === expected.action &&
    record.requestHash === expected.requestHash
  );
}

function normalizeDecimal(value: string): string {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) return value;
  return `${match[1]}.${(match[2] ?? "").padEnd(4, "0")}`;
}

function canonicalize(value: unknown, field?: string): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    if (field === "readings") {
      return items.sort((left, right) => {
        const first = left as Record<string, unknown>;
        const second = right as Record<string, unknown>;
        return `${first.kind}:${first.readingDate}:${first.id ?? ""}`.localeCompare(
          `${second.kind}:${second.readingDate}:${second.id ?? ""}`,
        );
      });
    }
    if (field === "bills" || field === "cashEntries") {
      return items.sort((left, right) =>
        String((left as Record<string, unknown>).id).localeCompare(
          String((right as Record<string, unknown>).id),
        ),
      );
    }
    return items;
  }
  if (
    typeof value === "string" &&
    (["reading", "startReading", "endReading", "unitPrice"].includes(field ?? "") ||
      field?.endsWith("UnitPrice"))
  ) {
    return normalizeDecimal(value);
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalize(record[key], key)]),
  );
}

function normalizeRequest(request: unknown): unknown {
  if (!request || typeof request !== "object" || Array.isArray(request))
    return canonicalize(request);
  const {
    expectedVersion: _version,
    idempotencyKey: _key,
    ...content
  } = request as Record<string, unknown>;
  return canonicalize(content);
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

/** 请求摘要忽略版本与幂等键等协议字段，重试时仍比较完整业务内容。 */
export function financeRequestHash(action: string, request: unknown): string {
  return digest({ action, request: normalizeRequest(request) });
}

/** 版本取持久化来源和规范化请求；不接受调用方生成的计划或临时读数 ID。 */
export function financeSourceVersion(source: unknown, request: unknown): string {
  return digest({ source: canonicalize(source), request: normalizeRequest(request) });
}
