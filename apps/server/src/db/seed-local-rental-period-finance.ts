import { createHash } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import type { RentalBillDetail } from "@xpense/shared";
import { and, eq } from "drizzle-orm";
import type { AuthContext } from "../common/auth/auth-context.js";
import { BillsReadService } from "../modules/rental/bills-read.service.js";
import { ChargeTermsService } from "../modules/rental/charge-terms.service.js";
import { PeriodBillVoidService } from "../modules/rental/period-bill-void.service.js";
import { PeriodBillsService } from "../modules/rental/period-bills.service.js";
import { RentalCashService } from "../modules/rental/rental-cash.service.js";
import type { AppDb } from "./db.module.js";
import { DB } from "./db.tokens.js";
import * as tables from "./schema.js";
/** 稳定步骤键查询真实幂等记录；重复演练不再次出账或登记资金。 */
export function periodSeedStepKey(contractId: string, step: string) {
  const hex = createHash("sha256").update(`${contractId}:${step}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function seedPeriodFinance(
  app: INestApplicationContext,
  auth: AuthContext,
  contractId: string,
  key: string,
  today: string,
) {
  const db = app.get<AppDb>(DB);
  const periods = app.get(PeriodBillsService);
  const cash = app.get(RentalCashService);
  const read = app.get(BillsReadService);
  const terms = app.get(ChargeTermsService);
  const step = async (name: string) => {
    const [saved] = await db
      .select()
      .from(tables.rentalFinanceRequests)
      .where(
        and(
          eq(tables.rentalFinanceRequests.organizationId, auth.organizationId),
          eq(tables.rentalFinanceRequests.contractId, contractId),
          eq(tables.rentalFinanceRequests.idempotencyKey, periodSeedStepKey(contractId, name)),
        ),
      );
    return saved;
  };
  const detail = (billId: string) => read.detail(auth, { id: billId });
  async function generate(name: string, water: string) {
    const saved = await step(name);
    if (saved) return detail(saved.result.resourceId);
    const context = await periods.context(auth, { contractId, page: 1, pageSize: 100 });
    const firstPeriodStart =
      key === "continuation" ? `${today.slice(0, 7)}-01` : context.nextPeriod!.periodStart;
    const input = {
      contractId,
      periodStart: firstPeriodStart,
      dueDate: firstPeriodStart,
      readings: context.defaultReadings.map((reading) => ({
        ...reading,
        reading: reading.kind === "water" ? water : reading.reading,
      })),
      extraFees: [],
      ...(!context.billingStart && key === "continuation"
        ? {
            billingStart: {
              firstPeriodStart,
              baselineReadings: context.defaultReadings.map((reading) => ({
                ...reading,
                reading: reading.kind === "water" ? "3500" : "50",
              })),
            },
          }
        : {}),
    };
    const preview = await periods.preview(auth, input);
    return periods.generate(auth, {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: periodSeedStepKey(contractId, name),
    });
  }
  async function receipt(name: string, bill: RentalBillDetail) {
    if (await step(name)) return;
    const current = await detail(bill.id);
    await cash.recordReceipt(auth, {
      target: { kind: "bill", billId: bill.id },
      amountMinor: 100,
      occurredOn: today,
      expectedVersion: current.financial!.version,
      idempotencyKey: periodSeedStepKey(contractId, name),
    });
  }
  const first = await generate("first", key === "calendar-quarter" ? "3500" : "3600");
  if (key === "continuation") return;
  if (key === "monthly-start") {
    if (!(await step("price"))) {
      const current = await terms.detail(auth, { contractId });
      await terms.update(auth, {
        contractId,
        waterUnitPrice: "4.0000",
        electricityUnitPrice: "4.0000",
        fixedFees: current.fixedFees,
        reason: "账期验收-默认价格调整",
        expectedVersion: current.version,
        idempotencyKey: periodSeedStepKey(contractId, "price"),
      });
    }
    await generate("second", "3680");
    return;
  }
  if (key === "calendar-quarter") {
    await generate("second", "3500");
    return;
  }
  if (key === "settlement-ready") {
    await generate("second", "3680");
    return;
  }
  await receipt("receipt", first);
  if (!(await step("revoke"))) {
    const saved = await step("receipt");
    if (!saved) throw new Error("收款步骤缺失");
    const current = await detail(first.id);
    if (current.canVoid) throw new Error("有收款的普通账单不应允许作废");
    await cash.revokeReceipt(auth, {
      entryId: saved.result.resourceId,
      reason: "账期验收-撤销后重开",
      expectedVersion: current.financial!.version,
      idempotencyKey: periodSeedStepKey(contractId, "revoke"),
    });
  }
  if (!(await step("void"))) {
    const current = await detail(first.id);
    await app.get(PeriodBillVoidService).void(auth, {
      billId: first.id,
      reason: "账期验收-核对重开",
      expectedVersion: current.version,
      idempotencyKey: periodSeedStepKey(contractId, "void"),
    });
  }
  const reopened = await generate("reopen", "3600");
  await receipt("reopen-receipt", reopened);
}
