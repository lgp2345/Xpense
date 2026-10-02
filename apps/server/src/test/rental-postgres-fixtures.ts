import { randomUUID } from "node:crypto";
import type { RentalBillLine, RentalBillSnapshot } from "@xpense/shared";
import { sql } from "drizzle-orm";
import type { AuthContext } from "../common/auth/auth-context.js";
import type { AppDb } from "../db/db.module.js";
import * as tables from "../db/schema.js";

/** 一份完整、无外部账号或资金账户的真实库来源；legacy 模式只用旧迁移已有字段。 */
export async function insertRentalPostgresFixture(db: AppDb, legacy = false, futureOnly = false) {
  const userId = randomUUID();
  const organizationId = randomUUID();
  const ledgerId = randomUUID();
  const propertyId = randomUUID();
  const spaceId = randomUUID();
  const tenantId = randomUUID();
  const contractId = randomUUID();
  const depositTermId = randomUUID();
  const generationId = randomUUID();
  const ids = { january: randomUUID(), february: randomUUID(), deposit: randomUUID() };
  const actor = { createdByUserId: userId, updatedByUserId: userId };
  const scope = { organizationId, contractId };
  await db
    .insert(tables.users)
    .values({ id: userId, email: `${userId}@example.invalid`, passwordHash: "unused-test-hash" });
  await db
    .insert(tables.organizations)
    .values({ id: organizationId, name: "隔离租赁测试", createdByUserId: userId });
  await db.insert(tables.ledgers).values({
    id: ledgerId,
    organizationId,
    name: "租赁测试账本",
    type: "rental",
    createdByUserId: userId,
  });
  await db.insert(tables.rentalProperties).values({
    id: propertyId,
    organizationId,
    ledgerId,
    name: "测试房产",
    type: "residential_unit",
    countryCode: "CN",
    addressLine: "测试地址",
    ...actor,
  });
  await db.insert(tables.rentalSpaces).values({
    id: spaceId,
    organizationId,
    propertyId,
    name: "测试房间",
    type: "room",
    isRentable: true,
    ...actor,
  });
  await db
    .insert(tables.rentalTenants)
    .values({ id: tenantId, organizationId, type: "individual", name: "测试租客", ...actor });
  if (legacy)
    await db.execute(sql`INSERT INTO rental_contracts
    (id, organization_id, property_id, contract_number, status, start_date, end_date, rent_amount_minor, billing_anchor, payment_interval_months, due_days_before, created_by_user_id, updated_by_user_id)
    VALUES (${contractId}, ${organizationId}, ${propertyId}, ${`TEST-${contractId}`}, 'confirmed', '2026-01-01', '2026-02-28', 10000, 'calendar_month', 1, 0, ${userId}, ${userId})`);
  else
    await db.insert(tables.rentalContracts).values({
      id: contractId,
      organizationId,
      propertyId,
      contractNumber: `TEST-${contractId}`,
      status: "confirmed",
      ...(legacy ? {} : { billingMode: "monthly_settlement" as const }),
      startDate: "2026-01-01",
      endDate: "2026-02-28",
      rentAmountMinor: 10000,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
      ...actor,
      ...(futureOnly
        ? {
            status: "terminated" as const,
            terminationDate: "2026-01-15",
            terminationRecordedAt: new Date("2026-01-15T00:00:00Z"),
            terminatedByUserId: userId,
            terminationReason: "实际退租",
          }
        : {}),
    });
  const spaces = [
    {
      spaceId,
      spaceName: "测试房间",
      spaceCode: null,
      spacePath: [{ id: spaceId, name: "测试房间" }],
      rentAllocationMinor: null,
    },
  ];
  await db.insert(tables.rentalContractSpaces).values({
    ...scope,
    propertyId,
    spaceId,
    spaceNameSnapshot: "测试房间",
    spacePathSnapshot: spaces[0]?.spacePath,
  });
  await db.insert(tables.rentalContractPartyPeriods).values({
    ...scope,
    tenantId,
    validFrom: "2026-01-01",
    validTo: "2026-02-28",
    isPrimaryPayer: true,
    tenantTypeSnapshot: "individual",
    tenantNameSnapshot: "测试租客",
  });
  const deposit = {
    id: depositTermId,
    type: "rental" as const,
    customName: null,
    calculationMode: "fixed_amount" as const,
    fixedAmountMinor: 5000,
    rentMultiple: null,
    finalAmountMinor: 5000,
    sortOrder: 0,
  };
  await db.insert(tables.rentalContractDepositTerms).values({ ...scope, ...deposit });
  const snapshot: RentalBillSnapshot = {
    propertyId,
    propertyName: "测试房产",
    contractNumber: `TEST-${contractId}`,
    spaces,
    parties: [],
  };
  await db.insert(tables.rentalBillGenerations).values({
    id: generationId,
    ...scope,
    idempotencyKey: randomUUID(),
    requestHash: "test",
    sourceVersion: "test",
    origin: "manual",
    createdCount: legacy ? 2 : 3,
    existingCount: 0,
    totals: { rentAmountMinor: 20000, depositAmountMinor: 5000, monthlyAmountMinor: 23000 },
    createdByUserId: userId,
  });
  const bills = legacy
    ? [
        {
          id: ids.january,
          type: "rent" as const,
          sourceKey: "rent:2026-01-01",
          amountMinor: 10000,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31",
          effectiveEnd: "2026-01-31",
        },
        {
          id: ids.deposit,
          type: "deposit" as const,
          sourceKey: `deposit:${depositTermId}`,
          amountMinor: 5000,
          depositSourceId: depositTermId,
          depositSnapshot: deposit,
        },
      ]
    : [
        {
          id: ids.january,
          type: "monthly" as const,
          billingMonth: "2026-01",
          sourceKey: "monthly:2026-01",
          amountMinor: futureOnly ? 10000 : 11000,
        },
        {
          id: ids.february,
          type: "monthly" as const,
          billingMonth: "2026-02",
          sourceKey: "monthly:2026-02",
          amountMinor: futureOnly ? 14300 : 12000,
        },
        {
          id: ids.deposit,
          type: "deposit" as const,
          sourceKey: `deposit:${depositTermId}`,
          amountMinor: 5000,
          depositSourceId: depositTermId,
          depositSnapshot: deposit,
        },
      ];
  for (const bill of bills) {
    if (legacy) {
      const legacyBill = bill as typeof tables.rentalBills.$inferInsert;
      await db.execute(sql`INSERT INTO rental_bills
        (id, organization_id, contract_id, property_id, bill_number, contract_number, property_name, currency_code, type, source_key, period_start, period_end, effective_end, due_date, amount_minor, generation_id, snapshot, deposit_source_id, deposit_snapshot, created_by_user_id)
        VALUES (${bill.id}, ${organizationId}, ${contractId}, ${propertyId}, ${`B-${bill.id}`}, ${snapshot.contractNumber}, ${snapshot.propertyName}, 'CNY', ${bill.type}, ${bill.sourceKey}, ${legacyBill.periodStart ?? null}, ${legacyBill.periodEnd ?? null}, ${legacyBill.effectiveEnd ?? null}, '2026-01-01', ${bill.amountMinor}, ${generationId}, ${JSON.stringify(snapshot)}::jsonb, ${legacyBill.depositSourceId ?? null}, ${legacyBill.depositSnapshot ? JSON.stringify(legacyBill.depositSnapshot) : null}::jsonb, ${userId})`);
    } else
      await db.insert(tables.rentalBills).values({
        ...bill,
        ...scope,
        propertyId,
        billNumber: `B-${bill.id}`,
        contractNumber: snapshot.contractNumber,
        propertyName: snapshot.propertyName,
        currencyCode: "CNY",
        dueDate: "2026-01-01",
        generationId,
        snapshot,
        createdByUserId: userId,
        ...(legacy ? {} : { modelVersion: 2 }),
      });
  }
  const line = (kind: RentalBillLine["kind"], amountMinor: number): RentalBillLine => ({
    kind,
    amountMinor,
    label: kind,
    sortOrder: 0,
    periodStart: null,
    periodEnd: null,
    referenceStart: null,
    referenceEnd: null,
    coveredDays: null,
    referenceDays: null,
    baseRentAmountMinor: null,
  });
  const lineIds: string[] = [];
  const insertLine = async (billId: string, value: RentalBillLine) => {
    const id = randomUUID();
    lineIds.push(id);
    if (legacy)
      await db.execute(sql`INSERT INTO rental_bill_lines
      (id, organization_id, contract_id, bill_id, kind, label, amount_minor, period_start, period_end, reference_start, reference_end, covered_days, reference_days, base_rent_amount_minor, sort_order)
      VALUES (${id}, ${organizationId}, ${contractId}, ${billId}, ${value.kind}, ${value.label}, ${value.amountMinor}, ${value.periodStart}, ${value.periodEnd}, ${value.referenceStart}, ${value.referenceEnd}, ${value.coveredDays}, ${value.referenceDays}, ${value.baseRentAmountMinor}, ${value.sortOrder})`);
    else await db.insert(tables.rentalBillLines).values({ id, ...scope, billId, ...value });
    return id;
  };
  const rent = (month: "01" | "02") => ({
    ...line("rent_period", 10000),
    periodStart: `2026-${month}-01`,
    periodEnd: month === "01" ? "2026-01-31" : "2026-02-28",
    referenceStart: `2026-${month}-01`,
    referenceEnd: month === "01" ? "2026-01-31" : "2026-02-28",
    coveredDays: month === "01" ? 31 : 28,
    referenceDays: month === "01" ? 31 : 28,
    baseRentAmountMinor: 10000,
  });
  await insertLine(ids.january, rent("01"));
  await insertLine(ids.deposit, line("deposit", 5000));
  if (!legacy) {
    await insertLine(ids.february, rent("02"));
    await db.insert(tables.rentalChargeTerms).values({
      ...scope,
      waterUnitPrice: "1.0000",
      electricityUnitPrice: "1.0000",
      fixedFees: [],
      updatedByUserId: userId,
    });
    const readings = [
      {
        id: randomUUID(),
        kind: "water" as const,
        readingDate: "2026-01-01",
        reading: "100.0000",
        predecessorId: null as string | null,
      },
      {
        id: randomUUID(),
        kind: "water" as const,
        readingDate: "2026-01-31",
        reading: "110.0000",
        predecessorId: null as string | null,
      },
      {
        id: randomUUID(),
        kind: "water" as const,
        readingDate: "2026-02-28",
        reading: "120.0000",
        predecessorId: null as string | null,
      },
      {
        id: randomUUID(),
        kind: "electricity" as const,
        readingDate: "2026-01-01",
        reading: "50.0000",
        predecessorId: null as string | null,
      },
      {
        id: randomUUID(),
        kind: "electricity" as const,
        readingDate: "2026-02-28",
        reading: "50.0000",
        predecessorId: null as string | null,
      },
    ];
    if (!readings[0] || !readings[1] || !readings[2] || !readings[3] || !readings[4])
      throw new Error("读数夹具不完整");
    readings[1].predecessorId = readings[0].id;
    readings[2].predecessorId = futureOnly ? readings[0].id : readings[1].id;
    readings[4].predecessorId = readings[3].id;
    for (const reading of readings.filter((_, index) => !futureOnly || index !== 1))
      await db
        .insert(tables.rentalMeterReadings)
        .values({ ...scope, spaceId, ...reading, reason: "测试抄表", ...actor });
    const intervals = futureOnly
      ? ([
          [ids.february, readings[0], readings[2], "2.0000", 4000],
          [ids.february, readings[3], readings[4], "1.0000", 0],
        ] as const)
      : ([
          [ids.january, readings[0], readings[1], "1.0000", 1000],
          [ids.february, readings[1], readings[2], "2.0000", 2000],
          [ids.february, readings[3], readings[4], "1.0000", 0],
        ] as const);
    for (const [billId, start, end, price, amount] of intervals) {
      const billLineId = await insertLine(billId, {
        ...line(end.kind, amount),
        sortOrder: end.kind === "water" ? 1 : 2,
        periodStart: start.readingDate,
        periodEnd: end.readingDate,
        feeSnapshot: {
          kind: end.kind,
          startReadingId: start.id,
          endReadingId: end.id,
          startReading: start.reading,
          endReading: end.reading,
          startDate: start.readingDate,
          endDate: end.readingDate,
          unitPrice: price,
          overrideReason: null,
        },
      });
      await db.insert(tables.rentalBillMeterIntervals).values({
        ...scope,
        billId,
        billLineId,
        spaceId,
        kind: end.kind,
        startReadingId: start.id,
        endReadingId: end.id,
      });
    }
    if (futureOnly) {
      for (const amountMinor of [500, -200])
        await insertLine(ids.february, {
          ...line("extra_fee", amountMinor),
          sortOrder: amountMinor > 0 ? 3 : 4,
          note: "未来月份额外费用",
          feeSnapshot: { kind: "extra_fee", extraFeeId: randomUUID(), origin: "monthly" },
        });
    }
    return {
      scope,
      ids,
      lineIds,
      actor,
      userId,
      organizationId,
      propertyId,
      spaceId,
      readings,
      auth: fixtureAuth(userId, organizationId),
    };
  }
  return {
    scope,
    ids,
    lineIds,
    actor,
    userId,
    organizationId,
    propertyId,
    spaceId,
    readings: [],
    auth: fixtureAuth(userId, organizationId),
  };
}

function fixtureAuth(userId: string, organizationId: string): AuthContext {
  return {
    userId,
    organizationId,
    sessionId: randomUUID(),
    isSuperAdmin: false,
    permissions: [
      "rental_contracts:read",
      "rental_bills:read",
      "rental_monthly_bills:adjust",
      "rental_settlements:read",
      "rental_settlements:confirm",
      "rental_receipts:create",
      "rental_refunds:create",
      "rental_refunds:revoke",
    ],
  };
}
