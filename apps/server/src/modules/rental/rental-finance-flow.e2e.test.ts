import { randomUUID } from "node:crypto";
import type { RentalBillDetail, RentalSettlementDetail } from "@xpense/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createRentalFinanceHttpHarness } from "../../test/rental-finance-http-harness.js";
import { rentalTestIds } from "../../test/rental-test-state.js";

describe("租赁月度收费到最终退款的完整 HTTP 流程", () => {
  let harness: Awaited<ReturnType<typeof createRentalFinanceHttpHarness>>;
  afterEach(async () => {
    if (harness) await harness.app.close();
    vi.useRealTimers();
  });

  it("新合同、相邻读数更正、补月结算、两次退款与误确认撤销保留完整事实", async () => {
    vi.setSystemTime(new Date("2026-10-02T00:00:00.000Z"));
    harness = await createRentalFinanceHttpHarness();
    harness.source.today = "2026-10-02";
    const owner = [...harness.state.roles.values()].find((role) => role.key === "owner");
    if (!owner) throw new Error("模拟 owner 角色缺失");
    owner.permissions.push("rental_monthly_bills:adjust");
    // 避开固定旧合同，所有新合同、财务写入均经过真实 service/controller。
    harness.state.rental.nextContractId = 2;
    const ok = async <T>(url: string, input?: unknown): Promise<T> => {
      const response = await harness.request(url, input);
      expect(response.statusCode, response.payload).toBe(200);
      return harness.parse<T>(response);
    };
    const contract = await ok<{ id: string; billingMode: string; lifecycleStatus: string }>(
      "/rental-contracts/create-confirmed",
      {
        propertyId: rentalTestIds.property,
        startDate: "2026-06-01",
        endDate: "2026-12-31",
        rentAmountMinor: 50000,
        billingAnchor: "calendar_month",
        paymentIntervalMonths: 1,
        dueDaysBefore: 0,
        parties: [{ tenantId: rentalTestIds.tenant, isPrimaryPayer: true }],
        spaces: [{ spaceId: rentalTestIds.childSpace }],
        depositTerms: [
          { type: "rental", calculationMode: "fixed_amount", fixedAmountMinor: 300000 },
        ],
      },
    );
    expect(contract).toMatchObject({
      billingMode: "monthly_settlement",
      lifecycleStatus: "confirmed",
    });
    expect(contract.id).not.toBe(harness.financeContractId);
    const contractId = contract.id;
    const charges = await ok<{ version: string }>(`/rental-charges/detail?id=${contractId}`);
    const fixedFeeId = randomUUID();
    await ok("/rental-charges/update", {
      contractId,
      expectedVersion: charges.version,
      idempotencyKey: randomUUID(),
      reason: "新合同收费约定",
      waterUnitPrice: "3.0000",
      electricityUnitPrice: "4.0000",
      fixedFees: [{ id: fixedFeeId, name: "物业费", monthlyAmountMinor: 1000 }],
    });
    const meters = await ok<{ version: string }>(`/rental-meters/detail?id=${contractId}`);
    await ok("/rental-meters/update", {
      contractId,
      expectedVersion: meters.version,
      idempotencyKey: randomUUID(),
      reason: "入住交接",
      readings: [
        { kind: "water", readingDate: "2026-06-01", reading: "100" },
        { kind: "electricity", readingDate: "2026-06-01", reading: "50" },
      ],
    });
    const depositInput = {
      contractId,
      scope: "deposits",
      depositDueDates: {} as Record<string, string>,
    };
    const blank = await ok<{ missingDepositSourceKeys: string[] }>(
      "/rental-bills/preview",
      depositInput,
    );
    expect(blank.missingDepositSourceKeys).toHaveLength(1);
    for (const key of blank.missingDepositSourceKeys)
      depositInput.depositDueDates[key] = "2026-06-01";
    const depositPreview = await ok<{ version: string }>("/rental-bills/preview", depositInput);
    await ok("/rental-bills/generate", {
      ...depositInput,
      expectedVersion: depositPreview.version,
      idempotencyKey: randomUUID(),
    });
    const deposit = harness.state.rental.bills.find(
      (bill) => bill.contractId === contractId && bill.type === "deposit",
    );
    if (!deposit) throw new Error("新合同押金账单未生成");
    const billDetail = (id: string) => ok<RentalBillDetail>(`/rental-bills/detail?id=${id}`);
    const depositDetail = await billDetail(deposit.id);
    expect(depositDetail.amountMinor).toBe(300000);
    await ok("/rental-receipts/confirm-deposit", {
      billId: deposit.id,
      occurredOn: "2026-06-01",
      expectedVersion: depositDetail.financial?.version,
      idempotencyKey: randomUUID(),
    });
    const generate = async (
      month: string,
      water: string,
      electricity: string,
      extraFees: unknown[],
    ) => {
      const date = `${month}-${month === "2026-06" ? "30" : "31"}`;
      const input = {
        contractId,
        billingMonth: month,
        dueDate: date,
        extraFees,
        readings: [
          { kind: "water", readingDate: date, reading: water },
          { kind: "electricity", readingDate: date, reading: electricity },
        ],
      };
      const preview = await ok<{ version: string }>("/rental-monthly-bills/preview", input);
      return ok<RentalBillDetail>("/rental-monthly-bills/generate", {
        ...input,
        expectedVersion: preview.version,
        idempotencyKey: randomUUID(),
      });
    };
    const discountId = randomUUID();
    const june = await generate("2026-06", "110", "60", [
      { id: discountId, name: "入住减免", amountMinor: -1000, note: "交接清洁补偿" },
    ]);
    const july = await generate("2026-07", "120", "70", []);
    expect([june.amountMinor, july.amountMinor]).toEqual([57000, 58000]);
    expect(june.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeSnapshot: { kind: "extra_fee", extraFeeId: discountId, origin: "monthly" },
          amountMinor: -1000,
          note: "交接清洁补偿",
        }),
      ]),
    );
    for (const amountMinor of [20000, 37000]) {
      const before = await billDetail(june.id);
      await ok("/rental-receipts/create", {
        target: { kind: "bill", billId: june.id },
        amountMinor,
        occurredOn: "2026-06-30",
        expectedVersion: before.financial?.version,
        idempotencyKey: randomUUID(),
      });
      expect((await billDetail(june.id)).financial?.version).not.toBe(before.financial?.version);
    }
    const adjustInput = {
      billId: june.id,
      expectedVersion: "preview",
      reason: "历史水表抄错",
      readings: [{ kind: "water", readingDate: "2026-06-30", reading: "115" }],
    };
    const adjustedPreview = await ok<{
      version: string;
      affectedBills: Array<{ billId: string; afterAmountMinor: number }>;
    }>("/rental-monthly-bills/adjust-preview", adjustInput);
    expect(
      adjustedPreview.affectedBills.map((bill) => [bill.billId, bill.afterAmountMinor]),
    ).toEqual([
      [june.id, 58500],
      [july.id, 56500],
    ]);
    await ok("/rental-monthly-bills/adjust", {
      ...adjustInput,
      expectedVersion: adjustedPreview.version,
      idempotencyKey: randomUUID(),
    });
    expect((await billDetail(june.id)).financial?.outstandingMinor).toBe(1500);
    expect(
      harness.state.rental.billRevisions.filter((item) => item.contractId === contractId),
    ).toHaveLength(2);
    await ok("/rental-contracts/terminate", {
      id: contractId,
      terminationDate: "2026-12-01",
      reason: "预约退租",
    });
    expect(
      harness.state.rental.settlements.filter((item) => item.contractId === contractId),
    ).toHaveLength(0);
    harness.state.rentalQuery.registerSpaceConflict(
      {
        organizationId: harness.state.rental.contracts.get(contractId)?.organizationId as string,
        propertyId: rentalTestIds.property,
        spaceIds: [rentalTestIds.childSpace],
        startDate: "2026-12-02",
        endDate: "2026-12-31",
        excludeContractId: contractId,
      },
      [],
    );
    await ok("/rental-contracts/revoke-termination", { id: contractId, reason: "撤销预约" });
    expect(harness.state.rental.contracts.get(contractId)?.terminationDate).toBeNull();
    await ok("/rental-contracts/terminate", {
      id: contractId,
      terminationDate: "2026-08-31",
      reason: "实际退租",
    });
    const settlementInput = {
      contractId,
      extraFees: [],
      finalReadings: [
        { kind: "water", readingDate: "2026-08-31", reading: "130" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "80" },
      ],
    };
    const settlementPreview = await ok<{ version: string; canConfirm: boolean }>(
      "/rental-settlements/preview",
      settlementInput,
    );
    expect(settlementPreview.canConfirm).toBe(true);
    const settlement = await ok<RentalSettlementDetail>("/rental-settlements/confirm", {
      ...settlementInput,
      expectedVersion: settlementPreview.version,
      idempotencyKey: randomUUID(),
    });
    expect(settlement).toMatchObject({
      finalCostMinor: 173000,
      balance: { receivedMinor: 357000, refundableMinor: 184000, refundedMinor: 0 },
    });
    const august = harness.state.rental.bills.find(
      (bill) => bill.contractId === contractId && bill.billingMonth === "2026-08",
    );
    if (!august) throw new Error("退租未补生成八月账单");
    expect(august).toMatchObject({ amountMinor: 58000, dueDate: "2026-08-31" });
    const settlementDetail = async () =>
      (
        await ok<{ settlement: RentalSettlementDetail }>(
          `/rental-settlements/detail?contractId=${contractId}`,
        )
      ).settlement;
    const refund = async () => {
      const current = await settlementDetail();
      return ok<{ id: string; amountMinor: number }>("/rental-refunds/create", {
        target: { kind: "settlement", settlementId: settlement.id },
        occurredOn: "2026-08-31",
        expectedVersion: current.balance.version,
        idempotencyKey: randomUUID(),
      });
    };
    await refund();
    expect((await settlementDetail()).balance).toMatchObject({
      refundedMinor: 184000,
      refundableMinor: 0,
    });
    const correction = {
      billId: august.id,
      expectedVersion: "preview",
      reason: "最终物业补偿",
      extraFees: [{ id: randomUUID(), name: "退租补偿", amountMinor: -10000, note: "退租验收" }],
    };
    const correctionPreview = await ok<{ version: string }>(
      "/rental-monthly-bills/adjust-preview",
      correction,
    );
    await ok("/rental-monthly-bills/adjust", {
      ...correction,
      expectedVersion: correctionPreview.version,
      idempotencyKey: randomUUID(),
    });
    expect(await settlementDetail()).toMatchObject({
      finalCostMinor: 163000,
      balance: { refundableMinor: 10000 },
    });
    await refund();
    const second = harness.state.rental.cashEntries
      .filter((entry) => entry.contractId === contractId && entry.kind === "refund")
      .at(-1);
    if (!second) throw new Error("第二笔退款未入历史");
    expect(second.amountMinor).toBe(10000);
    const afterTwo = await settlementDetail();
    expect(afterTwo.balance.refundedMinor).toBe(194000);
    await ok("/rental-refunds/revoke", {
      entryId: second.id,
      reason: "误确认第二笔退款",
      expectedVersion: afterTwo.balance.version,
      idempotencyKey: randomUUID(),
    });
    expect(await settlementDetail()).toMatchObject({
      balance: { receivedMinor: 357000, refundedMinor: 184000, refundableMinor: 10000 },
    });
    expect(
      harness.state.rental.cashEntries.filter((entry) => entry.contractId === contractId),
    ).toHaveLength(5);
    expect(
      harness.state.rental.cashEntries.find((entry) => entry.id === second.id)?.revokeReason,
    ).toBe("误确认第二笔退款");
    const history = await ok<{ items: unknown[] }>(
      `/rental-settlements/history?contractId=${contractId}`,
    );
    expect(history.items.length).toBeGreaterThan(0);
    const denied = await harness.request(
      "/rental-refunds/create",
      {
        target: { kind: "settlement", settlementId: settlement.id },
        occurredOn: "2026-08-31",
        expectedVersion: (await settlementDetail()).balance.version,
        idempotencyKey: randomUUID(),
      },
      harness.memberHeaders,
    );
    expect(denied.statusCode).toBe(403);
    expect(
      (
        await harness.request(
          `/rental-settlements/detail?contractId=${rentalTestIds.foreignContract}`,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await harness.request(`/rental-settlements/detail?contractId=${contractId}`, undefined, {}))
        .statusCode,
    ).toBe(401);
    expect(harness.state.auditLogs.some((log) => log.targetId === contractId)).toBe(true);
  });
});
