import { randomUUID } from "node:crypto";
import type { RentalContractDetail, RentalMeterReadingInput } from "@xpense/shared";

import type { ChargeTermsRepository } from "../modules/rental/charge-terms.repository.js";
import type { FinanceRequestsRepository } from "../modules/rental/finance-requests.repository.js";
import type { MeterReadingsRepository } from "../modules/rental/meter-readings.repository.js";
import type { RentalFinanceSnapshot } from "../modules/rental/rental-finance.types.js";
import { rentalBillingSource } from "./rental-billing-fixtures.js";
import type { RentalTestState } from "./rental-test-state.js";

export const rentalFinanceAuth = {
  organizationId: "org",
  userId: "user",
  sessionId: "session",
  isSuperAdmin: false,
  permissions: [
    "rental_contracts:read",
    "rental_bills:read",
    "rental_bills:generate",
    "rental_charges:read",
    "rental_charges:update",
    "rental_meters:read",
    "rental_meters:update",
    "rental_monthly_bills:generate",
  ],
} as const;

export const financeContractId = "00000000-0000-4000-8000-000000000001";
export const financeSpaceId = "00000000-0000-4000-8000-000000000003";
export const financeUserId = "00000000-0000-4000-8000-000000000010";

export function rentalFinanceSnapshot(
  overrides: Partial<RentalFinanceSnapshot> = {},
): RentalFinanceSnapshot {
  const billing = rentalBillingSource();
  const contract: RentalContractDetail & { billingMode: "monthly_settlement" } = {
    ...billing.contract,
    lifecycleStatus: "confirmed",
    displayStatus: "active",
    billingMode: "monthly_settlement",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    actualEndDate: "2026-12-31",
  };
  const baseline: RentalMeterReadingInput[] = [
    { kind: "water", readingDate: "2026-01-01", reading: "100" },
    { kind: "electricity", readingDate: "2026-01-01", reading: "50" },
  ];
  return {
    context: {
      organizationId: billing.organizationId,
      contractId: contract.id,
      today: "2026-08-31",
      currencyCode: "CNY",
      timezone: billing.timezone,
    },
    contract,
    terms: {
      contractId: contract.id,
      version: "1",
      waterUnitPrice: "3.0000",
      electricityUnitPrice: "4.0000",
      fixedFees: [
        { id: "00000000-0000-4000-8000-000000000011", name: "物业费", monthlyAmountMinor: 5000 },
      ],
    },
    readings: baseline.map((reading, index) => ({
      ...reading,
      id: `00000000-0000-4000-8000-00000000000${index + 4}`,
      contractId: contract.id,
      spaceId: financeSpaceId,
      revision: 1,
      predecessorId: null,
    })),
    bills: [],
    cashEntries: [],
    settlement: null,
    cancelledOn: null,
    ...overrides,
  };
}

/** 内存财务仓储只供 HTTP 测试使用；写入与租赁事务状态共用回滚快照。 */
export function createRentalFinanceRepositoryFakes(state: RentalTestState) {
  const scopeKey = (scope: { organizationId: string; contractId: string }) =>
    `${scope.organizationId}/${scope.contractId}`;
  const chargeTermsRepository: Partial<ChargeTermsRepository> = {
    find: async (scope) => {
      const record = state.chargeTerms.get(scopeKey(scope));
      return record ? structuredClone(record) : null;
    },
    save: async (scope, terms, reason, actor) => {
      const key = scopeKey(scope);
      const current = state.chargeTerms.get(key);
      const now = new Date();
      const record = {
        id: current?.id ?? randomUUID(),
        ...scope,
        version: (current?.version ?? 0) + 1,
        ...structuredClone(terms),
        updatedByUserId: actor.userId,
        updatedAt: now,
      } as NonNullable<Awaited<ReturnType<ChargeTermsRepository["save"]>>>;
      state.chargeTerms.set(key, record);
      state.chargeTermRevisions.push({
        id: randomUUID(),
        ...scope,
        version: record.version,
        termsSnapshot: {
          waterUnitPrice: record.waterUnitPrice,
          electricityUnitPrice: record.electricityUnitPrice,
          fixedFees: structuredClone(record.fixedFees),
        },
        reason,
        createdByUserId: actor.userId,
        createdAt: now,
      } as (typeof state.chargeTermRevisions)[number]);
      return structuredClone(record);
    },
  };
  const meterReadingsRepository: Partial<MeterReadingsRepository> = {
    list: async (scope) =>
      structuredClone(
        state.meterReadings
          .filter(
            (record) =>
              record.organizationId === scope.organizationId &&
              record.contractId === scope.contractId,
          )
          .toSorted((a, b) =>
            a.kind === b.kind
              ? a.readingDate.localeCompare(b.readingDate) || a.id.localeCompare(b.id)
              : a.kind.localeCompare(b.kind),
          ),
      ),
    saveBaseline: async (scope, inputs, reason, actor) => {
      const saved = [];
      for (const input of inputs) {
        const current = state.meterReadings.find(
          (record) =>
            record.organizationId === scope.organizationId &&
            record.contractId === scope.contractId &&
            record.kind === input.kind &&
            record.predecessorId === null,
        );
        const now = new Date();
        if (current) {
          state.meterReadingRevisions.push({
            id: randomUUID(),
            organizationId: scope.organizationId,
            contractId: scope.contractId,
            readingId: current.id,
            revision: current.revision,
            snapshot: structuredClone(current),
            reason,
            createdByUserId: actor.userId,
            createdAt: now,
          } as (typeof state.meterReadingRevisions)[number]);
          Object.assign(current, structuredClone(input), {
            revision: current.revision + 1,
            reason,
            updatedByUserId: actor.userId,
            updatedAt: now,
          });
          saved.push(structuredClone(current));
          continue;
        }
        const record = {
          id: randomUUID(),
          ...scope,
          ...structuredClone(input),
          revision: 1,
          reason,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
          createdAt: now,
          updatedAt: now,
        } as (typeof state.meterReadings)[number];
        state.meterReadings.push(record);
        saved.push(structuredClone(record));
      }
      return saved;
    },
    appendBoundary: async (scope, input, reason, actor) => {
      const now = new Date();
      const record = {
        id: randomUUID(),
        ...scope,
        ...structuredClone(input),
        revision: 1,
        reason,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      } as (typeof state.meterReadings)[number];
      state.meterReadings.push(record);
      return structuredClone(record);
    },
  };
  const financeRequestsRepository: Partial<FinanceRequestsRepository> = {
    find: async (scope, idempotencyKey) => {
      const record = state.financeRequests.find(
        (candidate) =>
          candidate.organizationId === scope.organizationId &&
          candidate.idempotencyKey === idempotencyKey,
      );
      return record ? structuredClone(record) : null;
    },
    complete: async (scope, input, actor) => {
      if (
        state.financeRequests.some(
          (candidate) =>
            candidate.organizationId === scope.organizationId &&
            candidate.idempotencyKey === input.idempotencyKey,
        )
      ) {
        throw new Error("Rental finance idempotency key already exists");
      }
      const record = {
        id: randomUUID(),
        ...scope,
        ...structuredClone(input),
        createdByUserId: actor.userId,
        createdAt: new Date(),
      } as (typeof state.financeRequests)[number];
      state.financeRequests.push(record);
      return structuredClone(record);
    },
  };
  return { chargeTermsRepository, meterReadingsRepository, financeRequestsRepository };
}
