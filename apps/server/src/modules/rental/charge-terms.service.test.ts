import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  financeContractId,
  rentalFinanceAuth,
  rentalFinanceSnapshot,
} from "../../test/rental-finance-fixtures.js";
import { ChargeTermsService } from "./charge-terms.service.js";
import { financeRequestHash } from "./rental-finance-request.rules.js";

function harness() {
  const snapshot = rentalFinanceSnapshot();
  const tx = {};
  const terms = {
    find: vi.fn().mockResolvedValue({ version: 1 }),
    save: vi.fn().mockImplementation(async (_scope, input) => ({
      contractId: financeContractId,
      version: 2,
      ...input,
    })),
  };
  const financeRequests = { find: vi.fn().mockResolvedValue(null), complete: vi.fn() };
  const bills = { findGeneration: vi.fn().mockResolvedValue(null) };
  const contracts = {
    find: vi.fn().mockResolvedValue({ propertyId: snapshot.contract.propertyId }),
    findForUpdate: vi.fn().mockResolvedValue({ propertyId: snapshot.contract.propertyId }),
  };
  const policy = {
    lockOrganizationContext: vi.fn().mockResolvedValue({ today: snapshot.context.today }),
    requireContract: vi.fn((value) => {
      if (!value) throw new Error("contract missing");
      return value;
    }),
    requireOwnedPropertyForUpdate: vi.fn().mockResolvedValue({ id: snapshot.contract.propertyId }),
  };
  const source = { read: vi.fn().mockResolvedValue(snapshot) };
  const transactions = { run: vi.fn((operation) => operation(tx)) };
  const audit = { appendRequired: vi.fn() };
  const access = { assertPermission: vi.fn() };
  const service = new ChargeTermsService(
    source as never,
    terms as never,
    financeRequests as never,
    bills as never,
    contracts as never,
    policy as never,
    access as never,
    audit as never,
    transactions as never,
  );
  return { service, snapshot, terms, financeRequests, bills, source, audit, tx };
}

describe("ChargeTermsService", () => {
  it("updates defaults with an audit and completed same-transaction request", async () => {
    const h = harness();
    const currentVersion = await h.service.detail(rentalFinanceAuth as never, {
      contractId: financeContractId,
    });
    const input = {
      contractId: financeContractId,
      expectedVersion: currentVersion.version,
      idempotencyKey: "00000000-0000-4000-8000-000000000020",
      reason: "水费单价调整",
      waterUnitPrice: "4",
      electricityUnitPrice: "4",
      fixedFees: [],
    };

    await expect(
      h.service.update(rentalFinanceAuth as never, input as never),
    ).resolves.toMatchObject({
      waterUnitPrice: "4",
      fixedFees: [],
    });
    expect(h.terms.save).toHaveBeenCalledWith(
      { organizationId: "org", contractId: financeContractId },
      expect.objectContaining({ waterUnitPrice: "4", fixedFees: [] }),
      "水费单价调整",
      { userId: "user" },
      h.tx,
    );
    expect(h.financeRequests.complete).toHaveBeenCalledWith(
      { organizationId: "org", contractId: financeContractId },
      expect.objectContaining({
        idempotencyKey: input.idempotencyKey,
        action: "charge_terms.update",
        requestHash: financeRequestHash("charge_terms.update", input),
      }),
      { userId: "user" },
      h.tx,
    );
    expect(h.audit.appendRequired).toHaveBeenCalled();
  });

  it("replays a completed identical key before rejecting its now-stale source version", async () => {
    const h = harness();
    const initial = await h.service.detail(rentalFinanceAuth as never, {
      contractId: financeContractId,
    });
    const input = {
      contractId: financeContractId,
      expectedVersion: initial.version,
      idempotencyKey: "00000000-0000-4000-8000-000000000021",
      reason: "水费单价调整",
      waterUnitPrice: "4",
      electricityUnitPrice: "4",
      fixedFees: [],
    };
    h.financeRequests.find.mockResolvedValue({
      organizationId: "org",
      contractId: financeContractId,
      action: "charge_terms.update",
      requestHash: financeRequestHash("charge_terms.update", input),
      result: { resourceId: financeContractId, resourceKind: "terms" },
    });

    await expect(
      h.service.update(rentalFinanceAuth as never, input as never),
    ).resolves.toMatchObject({
      waterUnitPrice: "3.0000",
    });
    expect(h.terms.save).not.toHaveBeenCalled();
  });

  it("replays saved charge terms after the contract is terminated without another write", async () => {
    const h = harness();
    const current = await h.service.detail(rentalFinanceAuth as never, {
      contractId: financeContractId,
    });
    const input = {
      contractId: financeContractId,
      expectedVersion: current.version,
      idempotencyKey: "00000000-0000-4000-8000-000000000023",
      reason: "水费单价调整",
      waterUnitPrice: "4",
      electricityUnitPrice: "4",
      fixedFees: [],
    };
    await h.service.update(rentalFinanceAuth as never, input as never);
    const completed = {
      organizationId: "org",
      contractId: financeContractId,
      idempotencyKey: input.idempotencyKey,
      action: "charge_terms.update",
      requestHash: financeRequestHash("charge_terms.update", input),
      result: { resourceId: financeContractId, resourceKind: "terms" },
    };
    h.financeRequests.find.mockResolvedValue(completed);
    h.source.read.mockResolvedValue({
      ...h.snapshot,
      contract: { ...h.snapshot.contract, lifecycleStatus: "terminated" },
      terms: {
        contractId: financeContractId,
        version: "2",
        waterUnitPrice: "4",
        electricityUnitPrice: "4",
        fixedFees: [],
      },
    } as never);

    await expect(
      h.service.update(rentalFinanceAuth as never, input as never),
    ).resolves.toMatchObject({
      waterUnitPrice: "4",
      electricityUnitPrice: "4",
    });
    expect(h.terms.save).toHaveBeenCalledTimes(1);
    expect(h.audit.appendRequired).toHaveBeenCalledTimes(1);
    expect(h.financeRequests.complete).toHaveBeenCalledTimes(1);
  });

  it("rejects stale source versions and keys already used by another action", async () => {
    const h = harness();
    const input = {
      contractId: financeContractId,
      expectedVersion: "stale-version",
      idempotencyKey: "00000000-0000-4000-8000-000000000022",
      reason: "修订收费",
      waterUnitPrice: "4",
      electricityUnitPrice: "4",
      fixedFees: [],
    };
    await expect(
      h.service.update(rentalFinanceAuth as never, input as never),
    ).rejects.toBeInstanceOf(ConflictException);
    h.financeRequests.find.mockResolvedValue({
      organizationId: "org",
      contractId: financeContractId,
      action: "meter_baseline.update",
      requestHash: "other",
    });
    await expect(
      h.service.update(rentalFinanceAuth as never, input as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
