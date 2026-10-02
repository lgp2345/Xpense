import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  financeContractId,
  financeSpaceId,
  rentalFinanceAuth,
  rentalFinanceSnapshot,
} from "../../test/rental-finance-fixtures.js";
import { MeterReadingsService } from "./meter-readings.service.js";
import { financeRequestHash } from "./rental-finance-request.rules.js";

function harness(snapshot = rentalFinanceSnapshot()) {
  const tx = {};
  const readings = {
    saveBaseline: vi.fn().mockResolvedValue([]),
    findAdjacentBillIds: vi.fn().mockResolvedValue([]),
  };
  const financeRequests = { find: vi.fn().mockResolvedValue(null), complete: vi.fn() };
  const bills = { findGeneration: vi.fn().mockResolvedValue(null) };
  const contracts = {
    find: vi.fn().mockResolvedValue({ propertyId: snapshot.contract.propertyId }),
    findForUpdate: vi.fn().mockResolvedValue({ propertyId: snapshot.contract.propertyId }),
  };
  const policy = {
    lockOrganizationContext: vi.fn().mockResolvedValue({ today: snapshot.context.today }),
    requireContract: vi.fn((value) => value),
    requireOwnedPropertyForUpdate: vi.fn().mockResolvedValue({ id: snapshot.contract.propertyId }),
  };
  const source = { read: vi.fn().mockResolvedValue(snapshot) };
  const service = new MeterReadingsService(
    source as never,
    readings as never,
    financeRequests as never,
    bills as never,
    contracts as never,
    policy as never,
    { assertPermission: vi.fn() } as never,
    { appendRequired: vi.fn() } as never,
    { run: vi.fn((operation) => operation(tx)) } as never,
  );
  return { service, snapshot, readings, financeRequests, source, tx };
}

describe("MeterReadingsService", () => {
  it.each([
    "2026-09-30",
    "2026-10-20",
  ])("终止日为%s的月结合同可读取入住底数，但不能重新登记", async (terminationDate) => {
    const h = harness();
    h.snapshot.context.today = "2026-10-01";
    h.snapshot.contract.lifecycleStatus = "terminated";
    h.snapshot.contract.terminationDate = terminationDate;
    const current = await h.service.detail(rentalFinanceAuth as never, {
      contractId: financeContractId,
    });
    expect(current.readings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "water", reading: "100" }),
        expect.objectContaining({ kind: "electricity", reading: "50" }),
      ]),
    );
    await expect(
      h.service.update(rentalFinanceAuth as never, {
        contractId: financeContractId,
        expectedVersion: current.version,
        idempotencyKey: "00000000-0000-4000-8000-000000000033",
        reason: "终止后不可重写入住底数",
        readings: [
          { kind: "water", readingDate: "2026-01-01", reading: "101" },
          { kind: "electricity", readingDate: "2026-01-01", reading: "51" },
        ],
      }),
    ).rejects.toThrow("只有履行中的合同可以登记入住底数");
    expect(h.readings.saveBaseline).not.toHaveBeenCalled();
    expect(h.financeRequests.complete).not.toHaveBeenCalled();
  });

  it("saves both baselines against the contract's only space and records the reason", async () => {
    const h = harness();
    const current = await h.service.detail(rentalFinanceAuth as never, {
      contractId: financeContractId,
    });
    const request = {
      contractId: financeContractId,
      readings: [
        { kind: "water", readingDate: "2026-01-01", reading: "101" },
        { kind: "electricity", readingDate: "2026-01-01", reading: "52" },
      ],
      expectedVersion: current.version,
      idempotencyKey: "00000000-0000-4000-8000-000000000030",
      reason: "入住交接抄表",
    };
    await h.service.update(rentalFinanceAuth as never, request as never);
    expect(h.readings.saveBaseline).toHaveBeenCalledWith(
      { organizationId: "org", contractId: financeContractId },
      expect.arrayContaining([
        expect.objectContaining({ spaceId: financeSpaceId, kind: "water", predecessorId: null }),
        expect.objectContaining({
          spaceId: financeSpaceId,
          kind: "electricity",
          predecessorId: null,
        }),
      ]),
      "入住交接抄表",
      { userId: "user" },
      h.tx,
    );
  });

  it("rejects replacing a baseline already used by a monthly bill", async () => {
    const snapshot = rentalFinanceSnapshot({
      bills: [
        {
          id: "bill-used-reading",
          status: "active",
          lines: [
            {
              kind: "water",
              feeSnapshot: {
                kind: "water",
                startReadingId: "00000000-0000-4000-8000-000000000004",
              },
            },
          ],
        } as never,
      ],
    });
    const h = harness(snapshot);
    const current = await h.service.detail(rentalFinanceAuth as never, {
      contractId: financeContractId,
    });
    await expect(
      h.service.update(
        rentalFinanceAuth as never,
        {
          contractId: financeContractId,
          readings: [
            { kind: "water", readingDate: "2026-01-01", reading: "101" },
            { kind: "electricity", readingDate: "2026-01-01", reading: "52" },
          ],
          expectedVersion: current.version,
          idempotencyKey: "00000000-0000-4000-8000-000000000031",
          reason: "更正底数",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.readings.saveBaseline).not.toHaveBeenCalled();
  });

  it("replays the saved baseline after the contract is terminated without another write", async () => {
    const h = harness();
    const current = await h.service.detail(rentalFinanceAuth as never, {
      contractId: financeContractId,
    });
    const input = {
      contractId: financeContractId,
      readings: [
        { kind: "water", readingDate: "2026-01-01", reading: "101" },
        { kind: "electricity", readingDate: "2026-01-01", reading: "52" },
      ],
      expectedVersion: current.version,
      idempotencyKey: "00000000-0000-4000-8000-000000000032",
      reason: "入住交接抄表",
    };
    await h.service.update(rentalFinanceAuth as never, input as never);
    const completed = {
      organizationId: "org",
      contractId: financeContractId,
      idempotencyKey: input.idempotencyKey,
      action: "meter_baseline.update",
      requestHash: financeRequestHash("meter_baseline.update", input),
      result: { resourceId: financeContractId, resourceKind: "baseline" },
    };
    h.financeRequests.find.mockResolvedValue(completed);
    h.source.read.mockResolvedValue({
      ...h.snapshot,
      contract: { ...h.snapshot.contract, lifecycleStatus: "terminated" },
      readings: h.snapshot.readings.map((reading) =>
        reading.predecessorId === null
          ? { ...reading, reading: reading.kind === "water" ? "101" : "52" }
          : reading,
      ),
    } as never);

    await expect(
      h.service.update(rentalFinanceAuth as never, input as never),
    ).resolves.toMatchObject({
      readings: [
        { kind: "electricity", reading: "52" },
        { kind: "water", reading: "101" },
      ],
    });
    expect(h.readings.saveBaseline).toHaveBeenCalledTimes(1);
  });
});
