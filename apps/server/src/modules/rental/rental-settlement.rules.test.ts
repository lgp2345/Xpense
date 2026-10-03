import type { RentalBillDetail, RentalBillLine, RentalCashEntry } from "@xpense/shared";
import { describe, expect, it } from "vitest";
import type { RentalFinanceSnapshot, RentalMeterReading } from "./rental-finance.types.js";
import { buildRentalSettlementPlan } from "./rental-settlement.rules.js";

function reading(
  id: string,
  kind: "water" | "electricity",
  readingDate: string,
  value: string,
  predecessorId: string | null,
): RentalMeterReading {
  return {
    id,
    kind,
    readingDate,
    reading: value,
    spaceId: "space-1",
    contractId: "contract-1",
    revision: 1,
    predecessorId,
  };
}

function line(
  kind: RentalBillLine["kind"],
  label: string,
  amountMinor: number,
  start: string | null,
  end: string | null,
): RentalBillLine {
  return {
    kind,
    label,
    amountMinor,
    periodStart: start,
    periodEnd: end,
    referenceStart: null,
    referenceEnd: null,
    coveredDays: null,
    referenceDays: null,
    baseRentAmountMinor: null,
    sortOrder: 0,
  };
}

function monthlyBill(id: string, billingMonth: string, lines: RentalBillLine[]): RentalBillDetail {
  return {
    id,
    billNumber: id,
    contractId: "contract-1",
    contractNumber: "C-1",
    propertyId: "property-1",
    propertyName: "P-1",
    currencyCode: "CNY",
    type: "monthly",
    status: "active",
    sourceKey: `monthly:${billingMonth}`,
    periodStart: "2026-10-01",
    periodEnd: "2026-12-31",
    effectiveEnd: "2026-12-31",
    dueDate: "2026-10-01",
    amountMinor: 313_200,
    dueState: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    modelVersion: 2,
    billingMonth,
    revision: 1,
    lines,
    generationId: null,
    adjustmentId: null,
    adjustment: null,
    snapshot: {
      propertyId: "property-1",
      propertyName: "P-1",
      contractNumber: "C-1",
      spaces: [],
      parties: [],
    },
    voidReason: null,
    voidedAt: null,
    voidedBy: null,
    history: [],
  };
}

function cash(
  id: string,
  kind: "receipt" | "refund",
  purpose: RentalCashEntry["purpose"],
  amountMinor: number,
  revokedAt: string | null = null,
  target: RentalCashEntry["target"] = { kind: "bill", billId: "bill-oct" },
): RentalCashEntry {
  return {
    id,
    contractId: "contract-1",
    target,
    kind,
    purpose,
    amountMinor,
    occurredOn: "2026-11-01",
    note: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    createdByUserId: "user-1",
    revokedAt,
    revokedByUserId: revokedAt ? "user-1" : null,
    revokeReason: revokedAt ? "重复登记" : null,
  };
}

function baseSnapshot(
  today = "2026-11-15",
  cancelledOn: string | null = null,
): RentalFinanceSnapshot {
  const waterStart = reading("w-0", "water", "2026-09-30", "100", null);
  const waterBilled = reading("w-1", "water", "2026-10-31", "110", waterStart.id);
  const waterFinal = reading("w-2", "water", "2026-11-15", "115", waterBilled.id);
  const powerStart = reading("e-0", "electricity", "2026-09-30", "50", null);
  const powerBilled = reading("e-1", "electricity", "2026-10-31", "52", powerStart.id);
  const powerFinal = reading("e-2", "electricity", "2026-11-15", "53", powerBilled.id);
  const rentLines = [
    ["2026-10-01", "2026-10-31", "2026-10-01", "2026-10-31"],
    ["2026-11-01", "2026-11-30", "2026-11-01", "2026-11-30"],
    ["2026-12-01", "2026-12-31", "2026-12-01", "2026-12-31"],
  ].map(([periodStart, periodEnd, referenceStart, referenceEnd], sortOrder) => ({
    ...line("rent_period", "月度租金", 100_000, periodStart ?? null, periodEnd ?? null),
    referenceStart: referenceStart ?? null,
    referenceEnd: referenceEnd ?? null,
    coveredDays: 30,
    referenceDays: 30,
    baseRentAmountMinor: 100_000,
    sortOrder,
  }));
  const currentLines: RentalBillLine[] = [
    ...rentLines,
    {
      ...line("water", "水费", 3_000, waterStart.readingDate, waterBilled.readingDate),
      feeSnapshot: {
        kind: "water",
        startReadingId: waterStart.id,
        endReadingId: waterBilled.id,
        startDate: waterStart.readingDate,
        endDate: waterBilled.readingDate,
        startReading: waterStart.reading,
        endReading: waterBilled.reading,
        unitPrice: "3",
        overrideReason: null,
      },
    },
    {
      ...line("electricity", "电费", 200, powerStart.readingDate, powerBilled.readingDate),
      feeSnapshot: {
        kind: "electricity",
        startReadingId: powerStart.id,
        endReadingId: powerBilled.id,
        startDate: powerStart.readingDate,
        endDate: powerBilled.readingDate,
        startReading: powerStart.reading,
        endReading: powerBilled.reading,
        unitPrice: "1",
        overrideReason: null,
      },
    },
    {
      ...line("fixed_fee", "网费", 10_000, "2026-10-01", "2026-10-31"),
      referenceStart: "2026-10-01",
      referenceEnd: "2026-10-31",
      coveredDays: 31,
      referenceDays: 31,
      feeSnapshot: {
        kind: "fixed_fee",
        feeId: "network",
        monthlyAmountMinor: 10_000,
        overrideReason: null,
      },
    },
  ];
  return {
    context: {
      organizationId: "organization-1",
      contractId: "contract-1",
      today,
      currencyCode: "CNY",
      timezone: "Asia/Shanghai",
    },
    contract: {
      id: "contract-1",
      lifecycleStatus: "terminated",
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      actualEndDate: "2026-11-15",
      terminationDate: "2026-11-15",
      cancellationReason: null,
      spaces: [
        {
          spaceId: "space-1",
          spaceName: "101",
          spaceCode: null,
          spacePath: [],
          rentAllocationMinor: null,
        },
      ],
      rentAmountMinor: 100_000,
      billingAnchor: "contract_start",
      paymentIntervalMonths: 3,
      dueDaysBefore: 0,
    } as unknown as RentalFinanceSnapshot["contract"],
    terms: {
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
      contractId: "contract-1",
      version: "terms-v1",
      waterUnitPrice: "4",
      electricityUnitPrice: "1",
      fixedFees: [{ id: "network", name: "网费", monthlyAmountMinor: 10_000 }],
    },
    readings: [waterStart, waterBilled, waterFinal, powerStart, powerBilled, powerFinal],
    bills: [monthlyBill("bill-oct", "2026-10", currentLines)],
    cashEntries: [
      cash("rent-receipt", "receipt", "bill_receipt", 200_000),
      cash("deposit-receipt", "receipt", "deposit_receipt", 300_000),
      cash("prior-refund", "refund", "refund", 10_000),
      cash("revoked", "receipt", "bill_receipt", 50_000, "2026-11-02T00:00:00.000Z"),
    ],
    settlement: null,
    cancelledOn,
  };
}

function refundScenarioSnapshot(): RentalFinanceSnapshot {
  const source = baseSnapshot();
  const waterStart = reading("refund-w-0", "water", "2026-09-30", "0", null);
  const waterFinal = reading("refund-w-1", "water", "2026-10-20", "100", waterStart.id);
  const electricityStart = reading("refund-e-0", "electricity", "2026-09-30", "0", null);
  const electricityFinal = reading(
    "refund-e-1",
    "electricity",
    "2026-10-20",
    "100",
    electricityStart.id,
  );
  const rent = {
    ...line("rent_period", "月度租金", 200_000, "2026-10-01", "2026-10-31"),
    referenceStart: "2026-10-01",
    referenceEnd: "2026-10-31",
    coveredDays: 31,
    referenceDays: 31,
    baseRentAmountMinor: 200_000,
  };
  const deposit = line("deposit", "押金", 300_000, null, null);

  source.contract = {
    ...source.contract,
    lifecycleStatus: "terminated",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    actualEndDate: "2026-10-20",
    terminationDate: "2026-10-20",
    rentAmountMinor: 200_000,
    billingAnchor: "calendar_month",
    paymentIntervalMonths: 1,
  };
  source.terms = {
    contractId: "contract-1",
    version: "terms-refund",
    waterCollectionEnabled: true,
    electricityCollectionEnabled: true,
    waterUnitPrice: "1",
    electricityUnitPrice: "1",
    fixedFees: [],
  };
  source.readings = [waterStart, waterFinal, electricityStart, electricityFinal];
  source.bills = [{ ...monthlyBill("bill-oct", "2026-10", [rent, deposit]), amountMinor: 500_000 }];
  source.cashEntries = [
    cash("refund-rent-receipt", "receipt", "bill_receipt", 200_000),
    cash("refund-deposit-receipt", "receipt", "deposit_receipt", 300_000),
  ];
  source.settlement = {
    id: "settlement-1",
    contractId: "contract-1",
    eventId: "termination-event-1",
    kind: "termination",
    effectiveEndDate: "2026-10-20",
    version: "settlement-v1",
    revision: 1,
    finalCostMinor: 149_032,
    balance: {
      receivedMinor: 500_000,
      refundedMinor: 0,
      netReceivedMinor: 500_000,
      outstandingMinor: 0,
      refundableMinor: 350_968,
      state: "refundable",
      overdue: false,
      version: "balance-v1",
    },
    status: "pending_refund",
    confirmedAt: "2026-10-20T12:00:00.000Z",
    confirmedByUserId: "user-1",
  };
  return source;
}

describe("buildRentalSettlementPlan", () => {
  it.each([
    ["full_month", 5000],
    ["manual_amount", 2000],
  ] as const)("退租裁剪保留%s固定费金额", (calculationMode, amountMinor) => {
    const source = baseSnapshot();
    source.readings = [];
    source.bills = [
      monthlyBill("bill-nov", "2026-11", [
        {
          ...line("fixed_fee", "管理费", amountMinor, "2026-11-01", "2026-11-30"),
          referenceStart: "2026-11-01",
          referenceEnd: "2026-11-30",
          coveredDays: 30,
          referenceDays: 30,
          feeSnapshot: {
            kind: "fixed_fee",
            feeId: "management",
            monthlyAmountMinor: 5000,
            overrideReason: null,
            calculationMode,
          },
        },
      ]),
    ];
    const plan = buildRentalSettlementPlan(source, {
      contractId: source.contract.id,
      extraFees: [],
      finalReadings: [],
    });
    const fixed = plan.finalBills
      .flatMap(({ lines }) => lines)
      .find(
        ({ feeSnapshot }) =>
          feeSnapshot?.kind === "fixed_fee" && feeSnapshot.feeId === "management",
      );
    expect(fixed?.amountMinor).toBe(amountMinor);
    expect(fixed?.periodEnd).toBe("2026-11-15");
  });

  it("withdraws an empty future monthly bill instead of retaining it as a zero-value final bill", () => {
    const source = baseSnapshot();
    source.contract = {
      ...source.contract,
      endDate: "2026-12-31",
      actualEndDate: "2026-10-15",
      terminationDate: "2026-10-15",
      paymentIntervalMonths: 1,
    };
    source.bills.push(
      monthlyBill("bill-nov", "2026-11", [
        {
          ...line("rent_period", "11 月租金", 100_000, "2026-11-01", "2026-11-30"),
          referenceStart: "2026-11-01",
          referenceEnd: "2026-11-30",
          coveredDays: 30,
          referenceDays: 30,
          baseRentAmountMinor: 100_000,
        },
        {
          ...line("fixed_fee", "网费", 10_000, "2026-11-01", "2026-11-30"),
          referenceStart: "2026-11-01",
          referenceEnd: "2026-11-30",
          coveredDays: 30,
          referenceDays: 30,
          feeSnapshot: {
            kind: "fixed_fee",
            feeId: "network",
            monthlyAmountMinor: 10_000,
            overrideReason: null,
          },
        },
      ]),
    );

    const plan = buildRentalSettlementPlan(source, {
      contractId: "contract-1",
      finalReadings: [],
      extraFees: [],
    });

    expect(plan).toMatchObject({
      withdrawnBillIds: ["bill-nov"],
      finalBills: expect.not.arrayContaining([expect.objectContaining({ billId: "bill-nov" })]),
    });
    expect(plan.finalBills.every(({ billingMonth }) => billingMonth <= "2026-10")).toBe(true);
  });

  it("withdraws future rent and monthly extras without requiring a future-extra policy", () => {
    const source = baseSnapshot();
    source.contract = {
      ...source.contract,
      endDate: "2026-12-31",
      actualEndDate: "2026-10-15",
      terminationDate: "2026-10-15",
      paymentIntervalMonths: 1,
    };
    source.bills.push(
      monthlyBill("bill-nov", "2026-11", [
        {
          ...line("rent_period", "11 月租金", 100_000, "2026-11-01", "2026-11-30"),
          referenceStart: "2026-11-01",
          referenceEnd: "2026-11-30",
          coveredDays: 30,
          referenceDays: 30,
          baseRentAmountMinor: 100_000,
        },
        {
          ...line("extra_fee", "月度加收", 5_000, "2026-11-01", "2026-11-30"),
          feeSnapshot: { kind: "extra_fee", extraFeeId: "nov-fee", origin: "monthly" },
        },
        {
          ...line("extra_fee", "月度减免", -2_000, "2026-11-01", "2026-11-30"),
          feeSnapshot: { kind: "extra_fee", extraFeeId: "nov-discount", origin: "monthly" },
        },
      ]),
    );

    const plan = buildRentalSettlementPlan(source, {
      contractId: "contract-1",
      finalReadings: [],
      extraFees: [],
    });

    expect(plan.withdrawnBillIds).toEqual(["bill-nov"]);
    expect(plan.finalBills.every(({ billingMonth }) => billingMonth <= "2026-10")).toBe(true);
    expect(
      plan.finalBills.flatMap(({ lines }) => lines).some(({ label }) => label.includes("11 月")),
    ).toBe(false);
  });

  it("replaces a charged P-to-E interval with P-to-T at its saved price and counts it once", () => {
    const source = baseSnapshot();
    source.contract = {
      ...source.contract,
      actualEndDate: "2026-10-15",
      terminationDate: "2026-10-15",
    };
    const terminal = reading("w-terminal", "water", "2026-10-15", "105", "w-0");
    source.readings.push(terminal);
    const later = source.readings.find(({ id }) => id === "w-1");
    if (!later) throw new Error("Expected the later real water reading");
    later.predecessorId = terminal.id;

    const plan = buildRentalSettlementPlan(source, {
      contractId: "contract-1",
      finalReadings: [
        { kind: "water", readingDate: terminal.readingDate, reading: terminal.reading },
      ],
      extraFees: [],
    });

    const waterLines = plan.finalBills.flatMap(({ billId, lines }) =>
      lines.filter((item) => item.kind === "water").map((item) => ({ billId, item })),
    );
    expect(waterLines).toHaveLength(1);
    expect(waterLines[0]).toMatchObject({
      billId: "bill-oct",
      item: {
        amountMinor: 1_500,
        feeSnapshot: {
          kind: "water",
          startReadingId: "w-0",
          endReadingId: "w-terminal",
          endDate: "2026-10-15",
          startReading: "100",
          endReading: "105",
          unitPrice: "3",
        },
      },
    });
    expect(later).toMatchObject({
      id: "w-1",
      readingDate: "2026-10-31",
      reading: "110",
      predecessorId: "w-terminal",
    });
  });

  it("拒绝重算出高于真实后继表读数的终值", () => {
    const source = baseSnapshot();
    source.contract = {
      ...source.contract,
      actualEndDate: "2026-10-15",
      terminationDate: "2026-10-15",
    };
    const terminal = reading("w-terminal", "water", "2026-10-15", "120", "w-0");
    source.readings.push(terminal);
    const later = source.readings.find(({ id }) => id === "w-1");
    if (!later) throw new Error("Expected the later real water reading");
    later.predecessorId = terminal.id;

    expect(() =>
      buildRentalSettlementPlan(source, {
        contractId: "contract-1",
        finalReadings: [
          { kind: "water", readingDate: terminal.readingDate, reading: terminal.reading },
        ],
        extraFees: [],
      }),
    ).toThrow("末次读数不能高于后续水电读数");
  });

  it("将结束月之后原账单中的跨界水费移入结束月并沿用该行历史单价", () => {
    const source = baseSnapshot();
    const previous = reading("w-january", "water", "2026-01-01", "100", null);
    const terminal = reading("w-june", "water", "2026-06-30", "110", previous.id);
    const later = reading("w-august", "water", "2026-08-31", "120", terminal.id);
    const electricity = source.readings.find(({ kind }) => kind === "electricity");
    if (!electricity) throw new Error("Expected an electricity baseline");
    source.contract = {
      ...source.contract,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      actualEndDate: "2026-06-30",
      terminationDate: "2026-06-30",
      paymentIntervalMonths: 1,
    };
    source.terms = {
      contractId: "contract-1",
      version: "terms-current",
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
      waterUnitPrice: "4",
      electricityUnitPrice: "1",
      fixedFees: [],
    };
    source.readings = [previous, terminal, later, electricity];
    source.bills = [
      monthlyBill("bill-august", "2026-08", [
        {
          ...line("water", "历史水费", 6_000, previous.readingDate, later.readingDate),
          feeSnapshot: {
            kind: "water",
            startReadingId: previous.id,
            endReadingId: later.id,
            startDate: previous.readingDate,
            endDate: later.readingDate,
            startReading: previous.reading,
            endReading: later.reading,
            unitPrice: "3",
            overrideReason: "历史覆盖价",
          },
        },
      ]),
    ];

    const plan = buildRentalSettlementPlan(source, {
      contractId: "contract-1",
      finalReadings: [
        { kind: "water", readingDate: terminal.readingDate, reading: terminal.reading },
      ],
      extraFees: [],
    });

    const waterLines = plan.finalBills.flatMap(({ billId, billingMonth, lines }) =>
      lines.filter((item) => item.kind === "water").map((item) => ({ billId, billingMonth, item })),
    );
    expect(waterLines).toHaveLength(1);
    expect(waterLines[0]).toMatchObject({
      billId: null,
      billingMonth: "2026-06",
      item: {
        amountMinor: 3_000,
        feeSnapshot: {
          startReadingId: previous.id,
          endReadingId: terminal.id,
          unitPrice: "3",
          overrideReason: "历史覆盖价",
        },
      },
    });
  });

  it("将完整发生在结束日前的未来账单水电区间移入结束月且只计一次", () => {
    const source = baseSnapshot();
    source.contract = {
      ...source.contract,
      actualEndDate: "2026-10-15",
      terminationDate: "2026-10-15",
    };
    const start = source.readings.find(({ id }) => id === "w-0");
    const oldEnd = source.readings.find(({ id }) => id === "w-1");
    const priorBill = source.bills[0];
    if (!start || !oldEnd) throw new Error("Expected the water reading chain");
    if (!priorBill) throw new Error("Expected the prior monthly bill");
    const happenedEnd = reading("w-happened", "water", "2026-10-10", "105", start.id);
    oldEnd.predecessorId = happenedEnd.id;
    source.bills[0] = {
      ...priorBill,
      lines: priorBill.lines.filter((item) => item.kind !== "water"),
    };
    source.readings.push(happenedEnd);
    source.bills.push(
      monthlyBill("bill-nov", "2026-11", [
        {
          ...line("water", "历史水费", 1_500, start.readingDate, happenedEnd.readingDate),
          feeSnapshot: {
            kind: "water",
            startReadingId: start.id,
            endReadingId: happenedEnd.id,
            startDate: start.readingDate,
            endDate: happenedEnd.readingDate,
            startReading: start.reading,
            endReading: happenedEnd.reading,
            unitPrice: "3",
            overrideReason: "历史覆盖价",
          },
        },
      ]),
    );

    const plan = buildRentalSettlementPlan(source, {
      contractId: "contract-1",
      finalReadings: [],
      extraFees: [],
    });

    const water = plan.finalBills.flatMap(({ billingMonth, billId, lines }) =>
      lines.filter((item) => item.kind === "water").map((item) => ({ billingMonth, billId, item })),
    );
    expect(water).toHaveLength(1);
    expect(water[0]).toMatchObject({
      billingMonth: "2026-10",
      billId: "bill-oct",
      item: {
        amountMinor: 1_500,
        feeSnapshot: {
          startReadingId: start.id,
          endReadingId: happenedEnd.id,
          unitPrice: "3",
          overrideReason: "历史覆盖价",
        },
      },
    });
    expect(plan.withdrawnBillIds).toEqual(["bill-nov"]);
    expect(
      plan.finalBills.flatMap(({ lines }) => lines).filter(({ kind }) => kind === "water"),
    ).toHaveLength(1);
  });

  it("preserves quarterly rent coverage, adds a missing month, avoids billed meter intervals and counts all valid cash", () => {
    const source = baseSnapshot();
    const plan = buildRentalSettlementPlan(source, {
      contractId: "contract-1",
      finalReadings: [
        { kind: "water", readingDate: "2026-11-15", reading: "115" },
        { kind: "electricity", readingDate: "2026-11-15", reading: "53" },
      ],
      extraFees: [{ id: "discount", name: "优惠", amountMinor: -500, note: "结算减免" }],
    });

    expect(plan.effectiveEndDate).toBe("2026-11-15");
    expect(
      plan.finalBills.map(({ billId, billingMonth, amountMinor }) => [
        billId,
        billingMonth,
        amountMinor,
      ]),
    ).toEqual([
      ["bill-oct", "2026-10", 163_200],
      [null, "2026-11", 11_600],
    ]);
    expect(
      plan.finalBills[0]?.lines
        .filter((item) => item.kind === "rent_period")
        .map((item) => [item.periodStart, item.periodEnd, item.amountMinor]),
    ).toEqual([
      ["2026-10-01", "2026-10-31", 100_000],
      ["2026-11-01", "2026-11-15", 50_000],
    ]);
    expect(plan.finalBills[1]?.lines.some((item) => item.kind === "rent_period")).toBe(false);
    expect(
      plan.finalBills
        .flatMap(({ lines }) => lines)
        .filter((item) => item.kind === "water" || item.kind === "electricity")
        .map((item) =>
          item.feeSnapshot && "startReadingId" in item.feeSnapshot
            ? [item.feeSnapshot.startReadingId, item.feeSnapshot.endReadingId]
            : null,
        ),
    ).toEqual([
      ["w-0", "w-1"],
      ["e-0", "e-1"],
      ["w-1", "w-2"],
      ["e-1", "e-2"],
    ]);
    expect(plan.finalCostMinor).toBe(174_800);
    expect(plan.differenceMinor).toBe(-315_200);
  });

  it("calculates the brief's 350968 refund and 50968 remaining refund after a 300000 refund", () => {
    const source = refundScenarioSnapshot();
    const input = {
      contractId: "contract-1",
      finalReadings: [
        { kind: "water" as const, readingDate: "2026-10-20", reading: "100" },
        { kind: "electricity" as const, readingDate: "2026-10-20", reading: "100" },
      ],
      extraFees: [],
    };

    const initial = buildRentalSettlementPlan(source, input);
    expect(
      initial.finalBills[0]?.lines.map(({ kind, amountMinor }) => [kind, amountMinor]),
    ).toEqual([
      ["rent_period", 129_032],
      ["water", 10_000],
      ["electricity", 10_000],
    ]);
    expect(
      initial.finalBills.flatMap(({ lines }) => lines).some((item) => item.kind === "deposit"),
    ).toBe(false);
    expect(initial.finalCostMinor).toBe(149_032);
    expect(initial.differenceMinor).toBe(-350_968);

    source.cashEntries.push(cash("first-refund", "refund", "refund", 300_000));
    const afterRefund = buildRentalSettlementPlan(source, input);
    expect(afterRefund.finalCostMinor).toBe(149_032);
    expect(afterRefund.differenceMinor).toBe(-50_968);
  });

  it("includes settlement-target receipts when recomputing the post-refund difference", () => {
    const source = refundScenarioSnapshot();
    source.cashEntries.push(
      cash("settlement-receipt", "receipt", "settlement_receipt", 10_000, null, {
        kind: "settlement",
        settlementId: "settlement-1",
      }),
      cash("settlement-refund", "refund", "refund", 300_000, null, {
        kind: "settlement",
        settlementId: "settlement-1",
      }),
    );

    const plan = buildRentalSettlementPlan(source, {
      contractId: "contract-1",
      finalReadings: [
        { kind: "water", readingDate: "2026-10-20", reading: "100" },
        { kind: "electricity", readingDate: "2026-10-20", reading: "100" },
      ],
      extraFees: [],
    });

    expect(plan.finalCostMinor).toBe(149_032);
    expect(plan.differenceMinor).toBe(-60_968);
  });

  it("uses the saved cancellation date, creates no occupancy charges and does not require final readings", () => {
    const first = baseSnapshot("2026-10-20", "2026-10-20");
    first.contract = {
      ...first.contract,
      lifecycleStatus: "cancelled",
      startDate: "2026-11-01",
      cancellationReason: "起租前取消",
      terminationDate: null,
    };
    first.bills = [];
    const later = { ...first, context: { ...first.context, today: "2026-11-30" } };

    const plan = buildRentalSettlementPlan(first, { contractId: "contract-1", extraFees: [] });
    const laterPlan = buildRentalSettlementPlan(later, { contractId: "contract-1", extraFees: [] });

    expect(plan.effectiveEndDate).toBe("2026-10-20");
    expect(laterPlan.effectiveEndDate).toBe("2026-10-20");
    expect(plan.finalBills).toEqual([]);
    expect(plan.finalCostMinor).toBe(0);
    expect(plan.differenceMinor).toBe(-490_000);
  });

  it("rejects a cancelled contract when no persisted cancellation date is available", () => {
    const source = baseSnapshot("2026-11-15", null);
    source.contract = { ...source.contract, lifecycleStatus: "cancelled", terminationDate: null };

    expect(() =>
      buildRentalSettlementPlan(source, { contractId: "contract-1", extraFees: [] }),
    ).toThrow(RangeError);
  });

  it("rejects terminal readings without a matching internally prepared reading identity", () => {
    const source = baseSnapshot();
    source.readings = source.readings.filter((item) => item.id !== "w-2");

    expect(() =>
      buildRentalSettlementPlan(source, {
        contractId: "contract-1",
        finalReadings: [{ kind: "water", readingDate: "2026-11-15", reading: "115" }],
        extraFees: [],
      }),
    ).toThrow(RangeError);
  });

  it("rejects a final settlement whose credits make an invoice negative", () => {
    const source = baseSnapshot();
    source.terms = {
      contractId: "contract-1",
      version: "terms-v1",
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
      waterUnitPrice: "4",
      electricityUnitPrice: "1",
      fixedFees: [],
    };
    source.bills = [];
    source.cashEntries = [];

    expect(() =>
      buildRentalSettlementPlan(source, {
        contractId: "contract-1",
        extraFees: [{ id: "credit", name: "超额减免", amountMinor: -300_001, note: "" }],
      }),
    ).toThrow(RangeError);
  });
});
