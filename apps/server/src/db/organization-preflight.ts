export type OrganizationPreflightRow = {
  id: string;
  name: string;
  baseCurrency: string;
  timezone: string;
  activeOwnerCount: number;
};
export type PreflightIssue = {
  organizationId: string;
  code:
    | "unnormalized_name"
    | "duplicate_name"
    | "unsupported_currency"
    | "invalid_timezone"
    | "missing_owner";
};

/** 只读检查历史组织的迁移前置条件，不重命名、不修复数据、不输出联系资料。 */
export function inspectOrganizationPreflight(rows: OrganizationPreflightRow[]): PreflightIssue[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name.trim(), (counts.get(row.name.trim()) ?? 0) + 1);
  const issues: PreflightIssue[] = [];
  for (const row of rows) {
    const report = (code: PreflightIssue["code"]) => issues.push({ organizationId: row.id, code });
    if (!row.name.trim() || row.name !== row.name.trim()) report("unnormalized_name");
    if ((counts.get(row.name.trim()) ?? 0) > 1) report("duplicate_name");
    if (row.baseCurrency !== "CNY" && row.baseCurrency !== "USD") report("unsupported_currency");
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: row.timezone });
    } catch {
      report("invalid_timezone");
    }
    if (row.activeOwnerCount === 0) report("missing_owner");
  }
  return issues;
}
