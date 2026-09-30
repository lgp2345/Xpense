import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  financeContractId,
  rentalFinanceAuth,
  rentalFinanceSnapshot,
} from "../../test/rental-finance-fixtures.js";
import { MonthlyBillsService } from "./monthly-bills.service.js";

function harness(snapshot = rentalFinanceSnapshot()) {
  const tx = {};
  let savedRequest: Record<string, unknown> | null = null;
  const financeRequests = {
    find: vi.fn().mockImplementation(async () => savedRequest),
    complete: vi.fn().mockImplementation(async (scope, input, actor) => {
      savedRequest = { ...scope, ...input, actor };
    }),
  };
  const readings = {
    appendBoundary: vi.fn().mockImplementation(async (_scope, input) => ({
      id: `real-${input.kind}-${input.readingDate}`,
      contractId: financeContractId,
      revision: 1,
      ...input,
    })),
  };
  const bill = {
    id: "00000000-0000-4000-8000-000000000040",
    contractId: financeContractId,
    status: "active",
    type: "monthly",
    modelVersion: 2,
    billingMonth: "2026-08",
    sourceKey: "monthly:2026-08",
    lines: [],
  };
  const bills = {
    findGeneration: vi.fn().mockResolvedValue(null),
    createGeneration: vi.fn().mockResolvedValue({ id: "generation-1" }),
    insertBills: vi.fn().mockResolvedValue([bill]),
    detail: vi.fn().mockResolvedValue(bill),
  };
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
  const audit = { appendRequired: vi.fn() };
  const service = new MonthlyBillsService(
    source as never,
    bills as never,
    readings as never,
    financeRequests as never,
    contracts as never,
    policy as never,
    { assertPermission: vi.fn() } as never,
    audit as never,
    { run: vi.fn((operation) => operation(tx)) } as never,
  );
  const readingsInput = [
    { kind: "water", readingDate: "2026-08-31", reading: "120" },
    { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
  ];
  const previewInput = { contractId: financeContractId, billingMonth: "2026-08", extraFees: [] };
  return {
    service,
    snapshot,
    financeRequests,
    readings,
    bills,
    source,
    audit,
    previewInput,
    readingsInput,
    tx,
  };
}

describe("MonthlyBillsService", () => {
  it("returns incomplete previews without persisting readings or allocating bill numbers", async () => {
    const h = harness();
    const preview = await h.service.preview(rentalFinanceAuth as never, h.previewInput as never);
    expect(preview).toMatchObject({
      canConfirm: false,
      billingMonth: "2026-08",
      existingBillId: null,
    });
    expect(preview.missingFields).toEqual(
      expect.arrayContaining(["dueDate", "waterReading", "electricityReading"]),
    );
    expect(h.readings.appendBoundary).not.toHaveBeenCalled();
    expect(h.bills.createGeneration).not.toHaveBeenCalled();
  });

  it("keeps preview version stable despite temporary IDs and preserves terms as defaults", async () => {
    const h = harness();
    const request = { ...h.previewInput, dueDate: "2026-08-31", readings: h.readingsInput };
    const first = await h.service.preview(rentalFinanceAuth as never, request as never);
    const second = await h.service.preview(rentalFinanceAuth as never, request as never);
    expect(first.version).toBe(second.version);
    expect(first.defaults.waterUnitPrice).toBe("3.0000");
    expect(first.lines.find((line) => line.kind === "water")?.amountMinor).toBe(6000);
    expect(h.readings.appendBoundary).not.toHaveBeenCalled();
  });

  it("writes real interval IDs once, returns bill, and replays before the now-stale preview version", async () => {
    const h = harness();
    const request = {
      ...h.previewInput,
      dueDate: "2026-08-31",
      readings: h.readingsInput,
    };
    const preview = await h.service.preview(rentalFinanceAuth as never, request as never);
    const generate = {
      ...request,
      expectedVersion: preview.version,
      idempotencyKey: "00000000-0000-4000-8000-000000000041",
    };
    await expect(
      h.service.generate(rentalFinanceAuth as never, generate as never),
    ).resolves.toMatchObject({
      id: "00000000-0000-4000-8000-000000000040",
    });
    expect(h.readings.appendBoundary).toHaveBeenCalledTimes(2);
    const persistedTerms = h.snapshot.terms;
    if (!persistedTerms) throw new Error("Expected persisted charge terms after monthly write");
    const sourceAfterWrite = { ...h.snapshot, terms: { ...persistedTerms, waterUnitPrice: "9" } };
    h.source.read.mockResolvedValue(sourceAfterWrite as never);
    await expect(
      h.service.generate(rentalFinanceAuth as never, generate as never),
    ).resolves.toMatchObject({
      id: "00000000-0000-4000-8000-000000000040",
    });
    expect(h.readings.appendBoundary).toHaveBeenCalledTimes(2);
  });

  it("records rent-period rows in the monthly generation rent total", async () => {
    const h = harness();
    const request = {
      ...h.previewInput,
      billingMonth: "2026-07",
      dueDate: "2026-07-31",
      readings: [
        { kind: "water", readingDate: "2026-07-31", reading: "120" },
        { kind: "electricity", readingDate: "2026-07-31", reading: "60" },
      ],
    };
    const preview = await h.service.preview(rentalFinanceAuth as never, request as never);
    const rentAmountMinor = preview.lines
      .filter((line) => line.kind === "rent_period")
      .reduce((total, line) => total + line.amountMinor, 0);
    expect(rentAmountMinor).toBeGreaterThan(0);

    await h.service.generate(
      rentalFinanceAuth as never,
      {
        ...request,
        expectedVersion: preview.version,
        idempotencyKey: "00000000-0000-4000-8000-000000000043",
      } as never,
    );

    expect(h.bills.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        totals: expect.objectContaining({ rentAmountMinor }),
      }),
      h.tx,
    );
  });

  it("rejects a second active bill for the same month before writing", async () => {
    const h = harness(
      rentalFinanceSnapshot({
        bills: [
          {
            id: "existing-monthly",
            type: "monthly",
            status: "active",
            modelVersion: 2,
            billingMonth: "2026-08",
            sourceKey: "monthly:2026-08",
            lines: [],
          } as never,
        ],
      }),
    );
    const request = {
      ...h.previewInput,
      dueDate: "2026-08-31",
      readings: h.readingsInput,
      expectedVersion: "any-version",
      idempotencyKey: "00000000-0000-4000-8000-000000000042",
    };
    await expect(
      h.service.generate(rentalFinanceAuth as never, request as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.bills.insertBills).not.toHaveBeenCalled();
  });

  it.each([
    [
      "negative total",
      {
        extraFees: [
          {
            id: "00000000-0000-4000-8000-000000000088",
            name: "减免",
            amountMinor: -999_999,
            note: "超额减免",
          },
        ],
      },
    ],
    [
      "decreasing water reading",
      {
        readings: [
          { kind: "water", readingDate: "2026-08-31", reading: "99" },
          { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
        ],
      },
    ],
    [
      "unsafe meter charge",
      {
        readings: [
          { kind: "water", readingDate: "2026-08-31", reading: "9999999999999999" },
          { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
        ],
      },
    ],
  ])("maps %s planning errors to a validation exception", async (_case, changes) => {
    const h = harness();
    const request = {
      ...h.previewInput,
      dueDate: "2026-08-31",
      readings: h.readingsInput,
      ...changes,
    };

    await expect(
      h.service.preview(rentalFinanceAuth as never, request as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
