import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRentalFinanceHttpHarness } from "../../test/rental-finance-http-harness.js";
import { cloneRentalTestState, rentalTestIds } from "../../test/rental-test-state.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";

type GeneratedMonthlyBill = {
  id: string;
  lines: Array<{
    kind: string;
    feeSnapshot?: { unitPrice?: string; overrideReason?: string | null } | null;
  }>;
};

describe("收费配置、入住底数与月度账单 HTTP", () => {
  let harness: Awaited<ReturnType<typeof createRentalFinanceHttpHarness>>;

  beforeEach(async () => {
    harness = await createRentalFinanceHttpHarness();
  });

  afterEach(async () => {
    if (harness) await harness.app.close();
  });

  it("绑定严格请求 schema，并通过 HTTP 返回预览、401、403、404 和 409", async () => {
    const contractId = harness.financeContractId;
    const terms = await harness.request(`/rental-charges/detail?id=${contractId}`);
    expect(terms.statusCode).toBe(200);
    expect(harness.parse<{ contractId: string }>(terms).contractId).toBe(contractId);

    const meters = await harness.request(`/rental-meters/detail?id=${contractId}`);
    expect(meters.statusCode).toBe(200);
    expect(harness.parse<{ readings: unknown[] }>(meters).readings).toHaveLength(2);

    const incomplete = await harness.request("/rental-monthly-bills/preview", {
      contractId,
      billingMonth: "2026-08",
      extraFees: [],
    });
    expect(incomplete.statusCode).toBe(200);
    expect(
      harness.parse<{ canConfirm: boolean; missingFields: string[] }>(incomplete),
    ).toMatchObject({
      canConfirm: false,
      missingFields: expect.arrayContaining(["dueDate", "waterReading", "electricityReading"]),
    });

    const invalidBody = await harness.request("/rental-monthly-bills/preview", {
      contractId,
      billingMonth: "2026-08",
      extraFees: [],
      rentAmountMinor: 1,
    });
    expect(invalidBody.statusCode).toBe(400);

    const unauthenticated = await harness.request(
      `/rental-charges/detail?id=${contractId}`,
      undefined,
      {},
    );
    expect(unauthenticated.statusCode).toBe(401);

    const denied = await harness.request(
      "/rental-charges/update",
      {
        contractId,
        expectedVersion: harness.parse<{ version: string }>(terms).version,
        idempotencyKey: randomUUID(),
        reason: "权限测试",
        waterUnitPrice: "3.0000",
        electricityUnitPrice: "4.0000",
        fixedFees: [],
      },
      harness.memberHeaders,
    );
    expect(denied.statusCode).toBe(403);

    const foreign = await harness.request(
      `/rental-charges/detail?id=${rentalTestIds.foreignContract}`,
    );
    expect(foreign.statusCode).toBe(404);

    const current = await harness.currentSnapshot();
    const stale = await harness.request("/rental-monthly-bills/generate", {
      contractId,
      billingMonth: "2026-08",
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "110" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
      ],
      extraFees: [],
      expectedVersion: `stale-${current.context.contractId}`,
      idempotencyKey: randomUUID(),
    });
    expect(stale.statusCode).toBe(409);
    expect(harness.state.rental.billGenerations).toHaveLength(0);
    expect(harness.state.rental.financeRequests).toHaveLength(0);
  });

  it("收费默认和入住底数可通过 HTTP 更新，月度确认写入真实账单及幂等结果", async () => {
    const contractId = harness.financeContractId;
    const currentTerms = await harness.request(`/rental-charges/detail?id=${contractId}`);
    const updatedTerms = await harness.request("/rental-charges/update", {
      contractId,
      expectedVersion: harness.parse<{ version: string }>(currentTerms).version,
      idempotencyKey: randomUUID(),
      reason: "本月水电价调整",
      waterUnitPrice: "4.0000",
      electricityUnitPrice: "5.0000",
      fixedFees: [
        { id: "00000000-0000-4000-8000-000000000011", name: "物业费", monthlyAmountMinor: 6000 },
      ],
    });
    expect(updatedTerms.statusCode).toBe(200);
    expect(harness.parse<{ waterUnitPrice: string }>(updatedTerms).waterUnitPrice).toBe("4.0000");

    const currentMeters = await harness.request(`/rental-meters/detail?id=${contractId}`);
    const updatedMeters = await harness.request("/rental-meters/update", {
      contractId,
      readings: [
        { kind: "water", readingDate: "2026-01-01", reading: "101" },
        { kind: "electricity", readingDate: "2026-01-01", reading: "51" },
      ],
      expectedVersion: harness.parse<{ version: string }>(currentMeters).version,
      idempotencyKey: randomUUID(),
      reason: "核对入住底数",
    });
    expect(updatedMeters.statusCode).toBe(200);
    expect(harness.state.rental.meterReadingRevisions).toHaveLength(2);

    const previewRequest = {
      contractId,
      billingMonth: "2026-07",
      dueDate: "2026-07-31",
      readings: [
        { kind: "water", readingDate: "2026-07-31", reading: "110" },
        { kind: "electricity", readingDate: "2026-07-31", reading: "60" },
      ],
      extraFees: [],
    };
    const preview = await harness.request("/rental-monthly-bills/preview", previewRequest);
    expect(preview.statusCode).toBe(200);
    const { version } = harness.parse<{ version: string }>(preview);
    const generated = await harness.request("/rental-monthly-bills/generate", {
      ...previewRequest,
      expectedVersion: version,
      idempotencyKey: randomUUID(),
    });
    expect(generated.statusCode).toBe(200);
    const generatedBill = harness.parse<{
      type: string;
      modelVersion: number;
      billingMonth: string;
      lines: Array<{ kind: string; amountMinor: number }>;
    }>(generated);
    expect(generatedBill).toMatchObject({
      type: "monthly",
      modelVersion: 2,
      billingMonth: "2026-07",
    });
    const rentAmountMinor = generatedBill.lines
      .filter((line) => line.kind === "rent_period")
      .reduce((total, line) => total + line.amountMinor, 0);
    expect(rentAmountMinor).toBeGreaterThan(0);
    expect(harness.state.rental.billGenerations[0]?.totals).toMatchObject({
      rentAmountMinor,
      depositAmountMinor: 0,
      monthlyAmountMinor: expect.any(Number),
    });
    expect(harness.state.rental.financeRequests[2]?.result.resourceKind).toBe("bill");
  });

  it("保存历史水价快照，单期覆盖不改变后续合同默认值", async () => {
    const contractId = harness.financeContractId;
    const generateBill = async (
      billingMonth: string,
      readingDate: string,
      waterReading: string,
      electricityReading: string,
      overrides?: { waterUnitPrice: string; reason: string },
    ) => {
      const request = {
        contractId,
        billingMonth,
        dueDate: readingDate,
        readings: [
          { kind: "water", readingDate, reading: waterReading },
          { kind: "electricity", readingDate, reading: electricityReading },
        ],
        extraFees: [],
        ...(overrides ? { overrides } : {}),
      };
      const preview = await harness.request("/rental-monthly-bills/preview", request);
      expect(preview.statusCode).toBe(200);
      const { version } = harness.parse<{ version: string }>(preview);
      const response = await harness.request("/rental-monthly-bills/generate", {
        ...request,
        expectedVersion: version,
        idempotencyKey: randomUUID(),
      });
      expect(response.statusCode).toBe(200);
      return harness.parse<GeneratedMonthlyBill>(response);
    };
    const waterFee = (bill: GeneratedMonthlyBill) =>
      bill.lines.find((line) => line.kind === "water")?.feeSnapshot;

    const firstBill = await generateBill("2026-08", "2026-08-31", "110", "60");
    expect(waterFee(firstBill)).toMatchObject({ unitPrice: "3.0000" });

    const currentTerms = await harness.request(`/rental-charges/detail?id=${contractId}`);
    const updatedTerms = await harness.request("/rental-charges/update", {
      contractId,
      expectedVersion: harness.parse<{ version: string }>(currentTerms).version,
      idempotencyKey: randomUUID(),
      reason: "合同默认水价调整",
      waterUnitPrice: "4.0000",
      electricityUnitPrice: "4.0000",
      fixedFees: [
        { id: "00000000-0000-4000-8000-000000000011", name: "物业费", monthlyAmountMinor: 5000 },
      ],
    });
    expect(updatedTerms.statusCode).toBe(200);

    const secondBill = await generateBill("2026-09", "2026-09-30", "120", "70");
    expect(waterFee(secondBill)).toMatchObject({ unitPrice: "4.0000" });
    const persistedFirstBill = harness.state.rental.bills.find((bill) => bill.id === firstBill.id);
    expect(
      persistedFirstBill?.lines.find((line) => line.kind === "water")?.feeSnapshot,
    ).toMatchObject({ unitPrice: "3.0000" });

    const overriddenBill = await generateBill("2026-10", "2026-10-31", "130", "80", {
      waterUnitPrice: "6.0000",
      reason: "本期临时水价",
    });
    expect(waterFee(overriddenBill)).toMatchObject({
      unitPrice: "6.0000",
      overrideReason: "本期临时水价",
    });
    const defaults = await harness.request(`/rental-charges/detail?id=${contractId}`);
    expect(
      harness.parse<{ waterUnitPrice: string; electricityUnitPrice: string }>(defaults),
    ).toMatchObject({
      waterUnitPrice: "4.0000",
      electricityUnitPrice: "4.0000",
    });
  });

  it("金额合计、递减读数和溢出都通过 HTTP 返回参数错误", async () => {
    const base = {
      contractId: harness.financeContractId,
      billingMonth: "2026-08",
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "110" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
      ],
      extraFees: [],
    };
    const cases = [
      {
        ...base,
        extraFees: [
          {
            id: "00000000-0000-4000-8000-000000000088",
            name: "超额减免",
            amountMinor: -Number.MAX_SAFE_INTEGER,
            note: "",
          },
        ],
      },
      {
        ...base,
        readings: [
          { kind: "water", readingDate: "2026-08-31", reading: "99" },
          { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
        ],
      },
      {
        ...base,
        readings: [
          { kind: "water", readingDate: "2026-08-31", reading: "9999999999999999" },
          { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
        ],
      },
    ];

    for (const request of cases) {
      const response = await harness.request("/rental-monthly-bills/preview", request);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).code).toBe("VALIDATION_FAILED");
    }
  });

  it("审计写入后失败会回滚入住读数、账单、幂等记录和审计日志", async () => {
    const contractId = harness.financeContractId;
    const previewRequest = {
      contractId,
      billingMonth: "2026-08",
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "110" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
      ],
      extraFees: [],
    };
    const preview = await harness.request("/rental-monthly-bills/preview", previewRequest);
    const { version } = harness.parse<{ version: string }>(preview);
    const auditCount = harness.state.auditLogs.length;
    const rentalAuditCount = harness.state.rental.auditEntries.length;
    harness.state.failNextRequiredAuditAppendAfterPersist = true;

    const failed = await harness.request("/rental-monthly-bills/generate", {
      ...previewRequest,
      expectedVersion: version,
      idempotencyKey: randomUUID(),
    });

    expect(failed.statusCode).toBe(500);
    expect(harness.state.rental.meterReadings).toHaveLength(2);
    expect(harness.state.rental.billGenerations).toHaveLength(0);
    expect(harness.state.rental.bills).toHaveLength(0);
    expect(harness.state.rental.financeRequests).toHaveLength(0);
    expect(harness.state.rental.auditEntries).toHaveLength(rentalAuditCount);
    expect(harness.state.auditLogs).toHaveLength(auditCount);
  });

  it("追加真实读数后计费规则失败会完整回滚事务状态", async () => {
    const repository = harness.app.get(MeterReadingsRepository);
    const appendBoundary = repository.appendBoundary.bind(repository);
    const appendSpy = vi
      .spyOn(repository, "appendBoundary")
      .mockImplementationOnce(async (...args) => {
        const saved = await appendBoundary(...args);
        return { ...saved, reading: "99" };
      });
    const previewRequest = {
      contractId: harness.financeContractId,
      billingMonth: "2026-08",
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "110" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
      ],
      extraFees: [],
    };
    const preview = await harness.request("/rental-monthly-bills/preview", previewRequest);
    const { version } = harness.parse<{ version: string }>(preview);
    const beforeRental = cloneRentalTestState(harness.state.rental);
    const beforeAudit = structuredClone(harness.state.auditLogs);

    const failed = await harness.request("/rental-monthly-bills/generate", {
      ...previewRequest,
      expectedVersion: version,
      idempotencyKey: randomUUID(),
    });

    expect(failed.statusCode).toBe(400);
    expect(JSON.parse(failed.payload).code).toBe("VALIDATION_FAILED");
    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(harness.state.rental).toEqual(beforeRental);
    expect(harness.state.auditLogs).toEqual(beforeAudit);
  });
});
