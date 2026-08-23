import { createHash } from "node:crypto";

const identityPrefix = "xpense:bookkeeping-default:v1";

/**
 * 派生组织默认个人账本的确定性 UUID。
 *
 * @param organizationId 默认账本所属组织的 UUID。
 * @returns 可由 PostgreSQL `md5('xpense:bookkeeping-default:v1:organization:' || organization_id::text || ':ledger:personal')::uuid` 精确复现的 UUID。
 */
export function deriveDefaultLedgerId(organizationId: string): string {
  return deriveIdentityUuid(`${identityPrefix}:organization:${organizationId}:ledger:personal`);
}

/**
 * 派生组织默认现金账户的确定性 UUID。
 *
 * @param organizationId 默认账户所属组织的 UUID。
 * @returns 可由 PostgreSQL `md5('xpense:bookkeeping-default:v1:organization:' || organization_id::text || ':account:cash')::uuid` 精确复现的 UUID。
 */
export function deriveDefaultAccountId(organizationId: string): string {
  return deriveIdentityUuid(`${identityPrefix}:organization:${organizationId}:account:cash`);
}

/**
 * 派生账本内默认一级分类的确定性 UUID。
 *
 * @param organizationId 默认分类所属组织的 UUID。
 * @param ledgerId 默认分类所属账本的 UUID。
 * @param type 分类的收入或支出类型。
 * @param categoryKey 与显示名称解耦、不可变的默认分类业务 key。
 * @returns 可由 PostgreSQL `md5('xpense:bookkeeping-default:v1:organization:' || organization_id::text || ':ledger:' || ledger_id::text || ':category:' || type || ':' || category_key)::uuid` 精确复现的 UUID。
 */
export function deriveDefaultCategoryId(
  organizationId: string,
  ledgerId: string,
  type: "income" | "expense",
  categoryKey: string,
): string {
  return deriveIdentityUuid(
    `${identityPrefix}:organization:${organizationId}:ledger:${ledgerId}:category:${type}:${categoryKey}`,
  );
}

/**
 * 使用 MD5 将稳定业务身份文本格式化为 PostgreSQL 可接受的 UUID。
 *
 * @param canonicalIdentity 由版本前缀和稳定业务 key 组成的规范身份文本。
 * @returns 32 位 MD5 十六进制按 UUID 的 8-4-4-4-12 形式格式化后的字符串。
 * @remarks MD5 仅用于非安全的确定性主键派生，不用于密码、签名、令牌或完整性校验。
 */
function deriveIdentityUuid(canonicalIdentity: string): string {
  const hex = createHash("md5").update(canonicalIdentity, "utf8").digest("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
