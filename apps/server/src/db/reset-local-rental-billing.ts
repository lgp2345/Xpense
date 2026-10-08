import { pathToFileURL } from "node:url";
import postgres from "postgres";

export const rentalBillingResetTables = [
  "rental_finance_requests",
  "rental_cash_entries",
  "rental_bill_meter_intervals",
  "rental_settlement_bills",
  "rental_settlement_revisions",
  "rental_meter_reading_revisions",
  "rental_meter_readings",
  "rental_billing_starts",
  "rental_settlements",
  "rental_bill_revisions",
  "rental_bill_lines",
  "rental_bills",
  "rental_bill_adjustments",
  "rental_bill_generations",
  "rental_charge_term_revisions",
  "rental_charge_terms",
] as const;
export type RentalBillingResetOptions = {
  organizationId: string;
  contractId?: string;
  apply: boolean;
};
/** 本地工具只接受明确组织，可限定合同；默认演练且不输出连接配置。 */
export function parseRentalBillingResetArgs(args: string[]): RentalBillingResetOptions {
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg !== "--organization-id" && arg !== "--contract-id")
      throw new Error("仅支持 --organization-id、--contract-id 和 --apply");
    const value = args[++index];
    if (!value || values.has(arg)) throw new Error("范围参数缺失或重复");
    values.set(arg, value);
  }
  const organizationId = values.get("--organization-id");
  const contractId = values.get("--contract-id");
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!organizationId || !uuid.test(organizationId) || (contractId && !uuid.test(contractId)))
    throw new Error("必须提供有效组织 ID，合同 ID 可选");
  return { organizationId, ...(contractId ? { contractId } : {}), apply };
}
export function assertLocalRentalDatabase(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("本地数据库配置格式无效");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]", "::1", "db", "postgres"].includes(url.hostname) ||
    [...url.searchParams.keys()].some((key) =>
      ["options", "search_path"].includes(key.toLowerCase()),
    )
  )
    throw new Error("拒绝写入：目标不是受支持的本地开发数据库");
}
export function assertRentalResetDependencies(
  dependencies: Array<{ table: string; referencedTable: string }>,
): void {
  const allowed = new Set<string>(rentalBillingResetTables);
  if (dependencies.some((item) => !allowed.has(item.table)))
    throw new Error("存在范围外或余额交易依赖，须先通过原业务撤销能力处理，未执行清理");
}
/** 限定清理账务及收费设置，房产、空间、合同、租户、组织、用户和记账交易均保留。 */
export async function resetLocalRentalBilling(url: string, options: RentalBillingResetOptions) {
  assertLocalRentalDatabase(url);
  const client = postgres(url, {
    max: 1,
    onnotice: () => {},
    connection: { application_name: "xpense-local-rental-reset" },
  });
  try {
    return await client.begin(async (tx) => {
      const organizations =
        await tx`SELECT id FROM organizations WHERE id=${options.organizationId} FOR UPDATE`;
      if (organizations.length !== 1) throw new Error("指定组织不存在");
      const contracts = options.contractId
        ? await tx`SELECT id FROM rental_contracts WHERE organization_id=${options.organizationId} AND id=${options.contractId} FOR UPDATE`
        : await tx`SELECT id FROM rental_contracts WHERE organization_id=${options.organizationId} FOR UPDATE`;
      const contractIds = contracts.map((row) => String(row.id));
      if (options.contractId && !contractIds.length) throw new Error("指定合同不属于目标组织");
      const present = await tx`SELECT tablename FROM pg_tables WHERE schemaname=current_schema()`;
      const names = new Set(present.map((row) => String(row.tablename)));
      const tables = rentalBillingResetTables.filter((table) => names.has(table));
      const dependencies = await tx<
        { table: string; referencedTable: string }[]
      >`SELECT origin.relname AS "table", target.relname AS "referencedTable" FROM pg_constraint dependency JOIN pg_class origin ON origin.oid=dependency.conrelid JOIN pg_class target ON target.oid=dependency.confrelid JOIN pg_namespace ns ON ns.oid=target.relnamespace WHERE dependency.contype='f' AND ns.nspname=current_schema() AND target.relname=ANY(${[...tables]})`;
      assertRentalResetDependencies(dependencies);
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const rows =
          await tx`SELECT count(*)::integer AS count FROM ${tx(table)} WHERE organization_id=${options.organizationId} AND contract_id=ANY(${contractIds}::uuid[])`;
        counts[table] = Number(rows[0]?.count ?? 0);
      }
      if (options.apply) {
        for (const table of tables)
          await tx`DELETE FROM ${tx(table)} WHERE organization_id=${options.organizationId} AND contract_id=ANY(${contractIds}::uuid[])`;
      }
      return {
        mode: options.apply ? "applied" : "dry-run",
        organizationId: options.organizationId,
        contractIds,
        counts,
        dependencies,
        retained: [
          "users",
          "organizations",
          "rental_properties",
          "rental_spaces",
          "rental_tenants",
          "rental_contracts",
          "transactions",
          "account_balances",
        ],
        nextStep: "旧收费标准和底数已列入清理范围，请重新登记；不将旧月费解释为每期金额。",
      };
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseRentalBillingResetArgs(process.argv.slice(2));
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("缺少本地数据库配置");
    process.stdout.write(
      `${JSON.stringify(await resetLocalRentalBilling(url, options), null, 2)}\n`,
    );
  } catch {
    process.stderr.write("租赁账务清理未完成，请检查本地配置、范围和依赖；未输出连接配置。\n");
    process.exitCode = 1;
  }
}
