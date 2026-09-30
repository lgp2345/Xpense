import { describe, expect, it } from "vitest";
import {
  financeRequestHash,
  financeSourceVersion,
  isFinanceRequestReplay,
} from "./rental-finance-request.rules.js";

const loadRules = () => import("./rental-finance-request.rules.js").catch(() => null);

describe("rental finance request fingerprints", () => {
  it("exposes one deterministic request and source fingerprint boundary", async () => {
    const rules = await loadRules();
    expect(rules?.financeRequestHash).toBeTypeOf("function");
    expect(rules?.financeSourceVersion).toBeTypeOf("function");
    expect(rules?.isFinanceRequestReplay).toBeTypeOf("function");
  });

  it("ignores replay protocol fields and canonicalizes decimal readings and reading order", () => {
    const first = {
      contractId: "contract-1",
      expectedVersion: "preview-version-1",
      idempotencyKey: "key-1",
      readings: [
        { kind: "electricity", readingDate: "2026-08-31", reading: "1.200" },
        { kind: "water", readingDate: "2026-08-30", reading: "0" },
      ],
    };
    const retried = {
      readings: [
        { reading: "0.0000", readingDate: "2026-08-30", kind: "water" },
        { reading: "1.2", readingDate: "2026-08-31", kind: "electricity" },
      ],
      idempotencyKey: "key-2",
      expectedVersion: "a-newer-preview-version",
      contractId: "contract-1",
    };

    expect(financeRequestHash("monthly_bill", first)).toBe(
      financeRequestHash("monthly_bill", retried),
    );
    expect(financeRequestHash("monthly_bill", first)).not.toBe(
      financeRequestHash("monthly_bill", { ...retried, contractId: "contract-2" }),
    );
  });

  it("includes persistent price, reading, bill, cash and settlement changes in a preview version", () => {
    const source = {
      context: {
        organizationId: "org-1",
        contractId: "contract-1",
        today: "2026-08-31",
        currencyCode: "CNY",
        timezone: "Asia/Shanghai",
      },
      contract: { id: "contract-1", billingMode: "monthly_settlement" },
      terms: { version: "1", waterUnitPrice: "3.0000" },
      readings: [{ id: "meter-1", kind: "water", readingDate: "2026-08-01", reading: "100.0" }],
      bills: [{ id: "bill-1", modelVersion: 2, revision: 1, amountMinor: 100 }],
      cashEntries: [{ id: "cash-1", amountMinor: 100, revokedAt: null }],
      settlement: null,
      cancelledOn: null,
    };
    const request = {
      contractId: "contract-1",
      billingMonth: "2026-08",
      readings: [{ kind: "water", readingDate: "2026-08-31", reading: "101" }],
    };
    const version = financeSourceVersion(source, request);

    expect(version).toBe(
      financeSourceVersion(
        {
          ...source,
          readings: [{ ...source.readings[0], reading: "100.0000" }],
        },
        {
          ...request,
          readings: [{ ...request.readings[0], reading: "101.0000" }],
        },
      ),
    );

    expect(version).not.toBe(
      financeSourceVersion(
        {
          ...source,
          terms: { ...source.terms, waterUnitPrice: "4" },
        },
        request,
      ),
    );
    expect(version).not.toBe(
      financeSourceVersion(
        {
          ...source,
          cashEntries: [{ ...source.cashEntries[0], amountMinor: 101 }],
        },
        request,
      ),
    );
    expect(version).not.toBe(
      financeSourceVersion(source, {
        ...request,
        readings: [{ kind: "water", readingDate: "2026-08-31", reading: "102" }],
      }),
    );
  });

  it("canonicalizes persisted meter unitPrice snapshots to the same decimal precision", () => {
    const source = {
      bills: [
        {
          id: "bill-1",
          lines: [
            {
              kind: "water",
              feeSnapshot: { kind: "water", unitPrice: "3" },
            },
          ],
        },
      ],
    };
    expect(financeSourceVersion(source, {})).toBe(
      financeSourceVersion(
        {
          bills: [
            {
              id: "bill-1",
              lines: [
                {
                  kind: "water",
                  feeSnapshot: { kind: "water", unitPrice: "3.0000" },
                },
              ],
            },
          ],
        },
        {},
      ),
    );
  });

  it("replays only an organization-scoped request with the same contract, action and content", () => {
    const record = {
      organizationId: "org-1",
      contractId: "contract-1",
      action: "monthly_bill",
      requestHash: "hash-1",
    };
    expect(isFinanceRequestReplay(record, record)).toBe(true);
    expect(isFinanceRequestReplay(record, { ...record, action: "terms_update" })).toBe(false);
    expect(isFinanceRequestReplay(record, { ...record, requestHash: "hash-2" })).toBe(false);
    expect(isFinanceRequestReplay(record, { ...record, contractId: "contract-2" })).toBe(false);
    expect(isFinanceRequestReplay(record, { ...record, organizationId: "org-2" })).toBe(false);
  });
});
