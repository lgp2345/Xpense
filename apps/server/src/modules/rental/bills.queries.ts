import type {
  ListRentalBillsQuery,
  RentalBillAdjustment,
  RentalBillDetail,
  RentalBillLine,
  RentalBillPage,
  RentalBillSummary,
} from "@xpense/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { rentalBillAdjustments, rentalBillLines, rentalBills } from "../../db/schema.js";
import type { AdjustmentRecord, BillRecord } from "./bills.repository.types.js";
import { calculateRentalCashBalance } from "./rental-cash.rules.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

/** 所有筛选保持组织作用域；关键字中的通配符按字面量检索。 */
export function billListCondition(organizationId: string, query: ListRentalBillsQuery): SQL {
  const keyword = query.keyword?.replace(/[\\%_]/g, (value) => `\\${value}`);
  return and(
    eq(rentalBills.organizationId, organizationId),
    query.contractId ? eq(rentalBills.contractId, query.contractId) : undefined,
    query.propertyId ? eq(rentalBills.propertyId, query.propertyId) : undefined,
    query.type ? eq(rentalBills.type, query.type) : undefined,
    query.status ? eq(rentalBills.status, query.status) : undefined,
    query.dueDateFrom ? gte(rentalBills.dueDate, query.dueDateFrom) : undefined,
    query.dueDateTo ? lte(rentalBills.dueDate, query.dueDateTo) : undefined,
    keyword ? ilike(rentalBills.billNumber, `%${keyword}%`) : undefined,
  ) as SQL;
}

/** 显式映射安全摘要，不把数据库字段和押金原条目返回列表。 */
export function toBillSummary(bill: BillRecord): RentalBillSummary {
  return {
    id: bill.id,
    billNumber: bill.billNumber,
    contractId: bill.contractId,
    contractNumber: bill.contractNumber,
    propertyId: bill.propertyId,
    propertyName: bill.propertyName,
    currencyCode: bill.currencyCode,
    type: bill.type,
    status: bill.status,
    sourceKey: bill.sourceKey,
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    effectiveEnd: bill.effectiveEnd,
    dueDate: bill.dueDate,
    amountMinor: bill.amountMinor,
    dueState: null,
    createdAt: bill.createdAt.toISOString(),
    ...(bill.modelVersion === 2
      ? {
          modelVersion: 2 as const,
          billingMonth: bill.billingMonth,
          revision: bill.revision,
        }
      : {}),
  };
}

/** 只为新版账单加现金余额和当前结算关联；legacy 账单不推断财务状态。 */
export function withBillFinancial<T extends RentalBillSummary>(
  bill: T,
  facts: RentalCashProjectionFacts,
  today: string,
  organizationId: string,
): T {
  if (bill.modelVersion !== 2) return bill;
  if (facts.contractId !== bill.contractId || facts.organizationId !== organizationId)
    throw new Error("Rental bill finance facts do not match the bill contract");
  const target = { kind: "bill", billId: bill.id } as const;
  const balance = calculateRentalCashBalance(
    facts.cashEntries,
    target,
    bill.amountMinor,
    bill.dueDate,
    today,
  );
  return {
    ...bill,
    financial: {
      ...balance,
      version: rentalCashSourceVersion(facts, target),
    },
    ...(facts.settlement && facts.settlementBillIds.includes(bill.id)
      ? { settlementId: facts.settlement.id }
      : {}),
  };
}

export function toBillAdjustment(record: AdjustmentRecord): RentalBillAdjustment {
  return {
    id: record.id,
    contractId: record.contractId,
    terminationDate: record.terminationDate,
    terminationRecordedAt: record.terminationRecordedAt.toISOString(),
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    originalAmountMinor: record.originalAmountMinor,
    referenceAmountMinor: record.referenceAmountMinor,
    finalAmountMinor: record.finalAmountMinor,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
  };
}

function safeSqlAmount(value: string | number | null): number {
  const amount = BigInt(value ?? 0);
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("应收汇总超出安全整数范围");
  return Number(amount);
}

/** 汇总只包含当前筛选中的有效账单，不把作废金额算入应收。 */
export async function queryBillPage(
  organizationId: string,
  query: ListRentalBillsQuery,
  executor: AppDbExecutor,
): Promise<RentalBillPage> {
  const condition = billListCondition(organizationId, query);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const items = await executor
    .select()
    .from(rentalBills)
    .where(condition)
    .orderBy(desc(rentalBills.createdAt), desc(rentalBills.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [totals] = await executor
    .select({
      total: count(),
      rent: sql<string>`coalesce(sum(case
        when ${rentalBills.status} = 'active' and ${rentalBills.type} = 'rent' then ${rentalBills.amountMinor}
        when ${rentalBills.status} = 'active' and ${rentalBills.type} = 'monthly' then (
          select coalesce(sum(${rentalBillLines.amountMinor}), 0)
          from ${rentalBillLines}
          where ${rentalBillLines.billId} = ${rentalBills.id}
            and ${rentalBillLines.organizationId} = ${rentalBills.organizationId}
            and ${rentalBillLines.contractId} = ${rentalBills.contractId}
            and ${rentalBillLines.kind} = 'rent_period'
        )
        else 0
      end), 0)`,
      deposit: sql<string>`coalesce(sum(case when ${rentalBills.status} = 'active' and ${rentalBills.type} = 'deposit' then ${rentalBills.amountMinor} else 0 end), 0)`,
      monthly: sql<string>`coalesce(sum(case when ${rentalBills.status} = 'active' and ${rentalBills.type} = 'monthly' then ${rentalBills.amountMinor} else 0 end), 0)`,
    })
    .from(rentalBills)
    .where(condition);
  return {
    items: items.map(toBillSummary),
    total: totals?.total ?? 0,
    page,
    pageSize,
    totals: {
      rentAmountMinor: safeSqlAmount(totals?.rent ?? null),
      depositAmountMinor: safeSqlAmount(totals?.deposit ?? null),
      monthlyAmountMinor: safeSqlAmount(totals?.monthly ?? null),
    },
    coverage: null,
  };
}

/** 用有界批次加载明细和调整，查询次数不随账单行数线性增长。 */
export async function loadBillDetails(
  records: BillRecord[],
  executor: AppDbExecutor,
): Promise<RentalBillDetail[]> {
  const result: RentalBillDetail[] = [];
  for (let offset = 0; offset < records.length; offset += 500) {
    const batch = records.slice(offset, offset + 500);
    const organizationId = (batch[0] as BillRecord).organizationId;
    const lines = await executor
      .select()
      .from(rentalBillLines)
      .where(
        and(
          eq(rentalBillLines.organizationId, organizationId),
          inArray(
            rentalBillLines.billId,
            batch.map((bill) => bill.id),
          ),
        ),
      )
      .orderBy(asc(rentalBillLines.sortOrder));
    const adjustmentIds = batch.flatMap((bill) => (bill.adjustmentId ? [bill.adjustmentId] : []));
    const adjustments = adjustmentIds.length
      ? await executor
          .select()
          .from(rentalBillAdjustments)
          .where(
            and(
              eq(rentalBillAdjustments.organizationId, organizationId),
              inArray(rentalBillAdjustments.id, adjustmentIds),
            ),
          )
      : [];
    const byBill = new Map<string, RentalBillLine[]>();
    for (const line of lines) {
      const {
        id: _id,
        organizationId: _org,
        contractId: _contract,
        billId,
        note,
        feeSnapshot,
        ...item
      } = line;
      const items = byBill.get(billId) ?? [];
      items.push({
        ...item,
        ...(note === null ? {} : { note }),
        ...(feeSnapshot === null ? {} : { feeSnapshot }),
      });
      byBill.set(billId, items);
    }
    const byAdjustment = new Map(
      adjustments.map((record) => [record.id, toBillAdjustment(record)]),
    );
    result.push(
      ...batch.map((bill) => ({
        ...toBillSummary(bill),
        lines: byBill.get(bill.id) ?? [],
        generationId: bill.generationId,
        adjustmentId: bill.adjustmentId,
        adjustment: bill.adjustmentId ? (byAdjustment.get(bill.adjustmentId) ?? null) : null,
        snapshot: bill.snapshot,
        voidReason: bill.voidReason,
        voidedAt: bill.voidedAt?.toISOString() ?? null,
        voidedBy: bill.voidedBy,
        history: [],
      })),
    );
  }
  return result;
}

/** 单张详情加载同来源最近二十张历史，绝不返回全合同历史。 */
export async function queryBillDetail(
  organizationId: string,
  id: string,
  executor: AppDbExecutor,
): Promise<RentalBillDetail | null> {
  const [record] = await executor
    .select()
    .from(rentalBills)
    .where(and(eq(rentalBills.organizationId, organizationId), eq(rentalBills.id, id)))
    .limit(1);
  if (!record) return null;
  const [detail] = await loadBillDetails([record], executor);
  if (!detail) throw new Error("Failed to load rental bill detail");
  const history = await executor
    .select()
    .from(rentalBills)
    .where(
      and(
        eq(rentalBills.organizationId, organizationId),
        eq(rentalBills.contractId, record.contractId),
        eq(rentalBills.type, record.type),
        eq(rentalBills.sourceKey, record.sourceKey),
        ne(rentalBills.id, id),
      ),
    )
    .orderBy(desc(rentalBills.createdAt), desc(rentalBills.id))
    .limit(20);
  return { ...detail, history: history.map(toBillSummary) };
}
