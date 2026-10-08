import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { NestFactory } from "@nestjs/core";
import type { PermissionKey } from "@xpense/shared";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { AppModule } from "../app.module.js";
import type { AuthContext } from "../common/auth/auth-context.js";
import { addCalendarDays, organizationDate } from "../modules/rental/contract-date.rules.js";
import { ContractLifecycleService } from "../modules/rental/contract-lifecycle.service.js";
import { ContractsService } from "../modules/rental/contracts.service.js";
import { createContractSchema } from "../modules/rental/dto/create-contract.dto.js";
import { PropertiesService } from "../modules/rental/properties.service.js";
import { SpacesService } from "../modules/rental/spaces.service.js";
import { TenantsService } from "../modules/rental/tenants.service.js";
import { DB } from "./db.tokens.js";
import { assertLocalRentalDatabase } from "./reset-local-rental-billing.js";
import * as tables from "./schema.js";
import { seedPeriodFinance } from "./seed-local-rental-period-finance.js";
export type PeriodSeedOptions = { organizationId: string; actorUserId: string; apply: boolean };
export function parsePeriodSeedArgs(args: string[]): PeriodSeedOptions {
  const values = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--apply") {
      apply = true;
      continue;
    }
    if (key !== "--organization-id" && key !== "--actor-user-id")
      throw new Error("仅支持组织、已有操作者与 --apply");
    const value = args[++i];
    if (!value || values.has(key)) throw new Error("参数缺失或重复");
    values.set(key, value);
  }
  const organizationId = values.get("--organization-id");
  const actorUserId = values.get("--actor-user-id");
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!organizationId || !actorUserId || !uuid.test(organizationId) || !uuid.test(actorUserId))
    throw new Error("必须指定有效组织及已有操作者 ID");
  return { organizationId, actorUserId, apply };
}
function monthStart(today: string, offset: number, day: number) {
  const [year, month] = today.split("-").map(Number);
  const index = year! * 12 + month! - 1 + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function periodSeedScenarios(today: string) {
  const start = monthStart(today, -2, 5);
  const end = addCalendarDays(monthStart(today, 4, 5), -1);
  return [
    {
      key: "monthly-start",
      name: "月付起租日与涨价",
      start,
      end,
      anchor: "contract_start" as const,
      months: 1 as const,
    },
    {
      key: "calendar-quarter",
      name: "自然月季付同日提前多期与零用量",
      start: monthStart(today, -2, 1),
      end: monthStart(today, 8, 1),
      anchor: "calendar_month" as const,
      months: 3 as const,
    },
    {
      key: "continuation",
      name: "本月接续历史线下结清",
      start: monthStart(today, -12, 1),
      end,
      anchor: "calendar_month" as const,
      months: 1 as const,
    },
    {
      key: "paid-void",
      name: "收款阻断作废与撤销重开",
      start,
      end,
      anchor: "contract_start" as const,
      months: 1 as const,
    },
    {
      key: "settlement-ready",
      name: "退租尾期水电与固定费手动退款",
      start,
      end: addCalendarDays(today, -1),
      anchor: "contract_start" as const,
      months: 1 as const,
    },
  ];
}
/** 演练只查询既有范围与 schema；写入仅通过业务服务，不建立用户或密码。 */
export async function seedLocalRentalPeriodBilling(url: string, options: PeriodSeedOptions) {
  assertLocalRentalDatabase(url);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle({ client });
  try {
    const [organization] = await db
      .select()
      .from(tables.organizations)
      .where(eq(tables.organizations.id, options.organizationId));
    const [member] = await db
      .select()
      .from(tables.organizationMemberships)
      .where(
        and(
          eq(tables.organizationMemberships.organizationId, options.organizationId),
          eq(tables.organizationMemberships.userId, options.actorUserId),
        ),
      );
    if (!organization || !member || member.status !== "active")
      throw new Error("组织或有效成员不存在");
    const today = organizationDate(new Date(), organization.timezone);
    const scenarios = periodSeedScenarios(today);
    const columns =
      await client`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='rental_bills'`;
    const schemaReady =
      columns.some((c) => c.column_name === "period_start") &&
      !columns.some((c) => c.column_name === "billing_month");
    const grantRows = await db
      .select({ key: tables.permissions.key })
      .from(tables.rolePermissions)
      .innerJoin(tables.permissions, eq(tables.permissions.id, tables.rolePermissions.permissionId))
      .where(eq(tables.rolePermissions.roleId, member.roleId));
    if (!options.apply)
      return {
        mode: "dry-run",
        schemaReady,
        organizationId: options.organizationId,
        today,
        scenarios,
      };
    if (!schemaReady) throw new Error("须先完成限定旧账务清理和账期迁移");
    const auth: AuthContext = {
      userId: options.actorUserId,
      organizationId: options.organizationId,
      sessionId: randomUUID(),
      isSuperAdmin: false,
      permissions: grantRows.map((row) => row.key as PermissionKey),
    };
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
      const paths = [];
      for (const scenario of scenarios) {
        const marker = `账期验收-${scenario.key}`;
        const name = `账期验收-${scenario.name}`;
        let [property] = await db
          .select()
          .from(tables.rentalProperties)
          .where(
            and(
              eq(tables.rentalProperties.organizationId, options.organizationId),
              eq(tables.rentalProperties.name, name),
              isNull(tables.rentalProperties.deletedAt),
            ),
          );
        if (!property) {
          const created = await app.get(PropertiesService).create(auth, {
            name,
            type: "residential_unit",
            countryCode: "CN",
            addressLine: "合成验收地址",
          });
          [property] = await db
            .select()
            .from(tables.rentalProperties)
            .where(eq(tables.rentalProperties.id, created.id));
        }
        if (!property) throw new Error("房产写入失败");
        let [space] = await db
          .select()
          .from(tables.rentalSpaces)
          .where(
            and(
              eq(tables.rentalSpaces.organizationId, options.organizationId),
              eq(tables.rentalSpaces.propertyId, property.id),
              eq(tables.rentalSpaces.name, "账期验收-房间"),
              isNull(tables.rentalSpaces.deletedAt),
            ),
          );
        if (!space) {
          const created = await app.get(SpacesService).create(auth, {
            propertyId: property.id,
            name: "账期验收-房间",
            type: "room",
            isRentable: true,
          });
          [space] = await db
            .select()
            .from(tables.rentalSpaces)
            .where(eq(tables.rentalSpaces.id, created.id));
        }
        if (!space) throw new Error("空间写入失败");
        let [tenant] = await db
          .select()
          .from(tables.rentalTenants)
          .where(
            and(
              eq(tables.rentalTenants.organizationId, options.organizationId),
              eq(tables.rentalTenants.name, name),
              isNull(tables.rentalTenants.deletedAt),
            ),
          );
        if (!tenant) {
          const created = await app.get(TenantsService).create(auth, { type: "individual", name });
          [tenant] = await db
            .select()
            .from(tables.rentalTenants)
            .where(eq(tables.rentalTenants.id, created.id));
        }
        if (!tenant) throw new Error("租户写入失败");
        let [contract] = await db
          .select()
          .from(tables.rentalContracts)
          .where(
            and(
              eq(tables.rentalContracts.organizationId, options.organizationId),
              eq(tables.rentalContracts.externalContractNumber, marker),
              isNull(tables.rentalContracts.deletedAt),
            ),
          );
        const reused = Boolean(contract);
        if (!contract) {
          const created = await app.get(ContractsService).create(
            auth,
            createContractSchema.parse({
              propertyId: property.id,
              externalContractNumber: marker,
              startDate: scenario.start,
              endDate: scenario.end,
              rentAmountMinor: 300000,
              billingAnchor: scenario.anchor,
              paymentIntervalMonths: scenario.months,
              dueDaysBefore: 0,
              spaces: [{ spaceId: space.id }],
              parties: [{ tenantId: tenant.id, isPrimaryPayer: true }],
              depositTerms: [
                { type: "rental", calculationMode: "fixed_amount", fixedAmountMinor: 310000 },
              ],
              chargeSetup: {
                chargeTerms: {
                  waterCollectionEnabled: true,
                  electricityCollectionEnabled: true,
                  waterUnitPrice: "3.0000",
                  electricityUnitPrice: "4.0000",
                  fixedFees: [{ id: randomUUID(), name: "管理费", periodAmountMinor: 10000 }],
                },
                baselineReadings: [
                  { kind: "water", readingDate: scenario.start, reading: "3500" },
                  { kind: "electricity", readingDate: scenario.start, reading: "50" },
                ],
              },
            }),
          );
          [contract] = await db
            .select()
            .from(tables.rentalContracts)
            .where(eq(tables.rentalContracts.id, created.id));
        }
        if (!contract) throw new Error("合同写入失败");
        if (contract.status === "draft")
          await app.get(ContractLifecycleService).confirm(auth, { id: contract.id });
        await seedPeriodFinance(app, auth, contract.id, scenario.key, today);
        paths.push({
          scenario: scenario.name,
          contractId: contract.id,
          reused,
          path: `/rentals/contracts/${contract.id}`,
          settlementPath: `/rentals/settlements/${contract.id}`,
        });
      }
      return { mode: "applied", organizationId: options.organizationId, today, scenarios: paths };
    } finally {
      await (app.get(DB) as typeof db).$client.end({ timeout: 5 });
      await app.close();
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("本地配置缺失");
    process.stdout.write(
      `${JSON.stringify(await seedLocalRentalPeriodBilling(url, parsePeriodSeedArgs(process.argv.slice(2))), null, 2)}\n`,
    );
  } catch {
    process.stderr.write(
      "账期验收数据准备未完成，请检查本地目标、范围、schema 与权限；未输出连接配置。\n",
    );
    process.exitCode = 1;
  }
}
