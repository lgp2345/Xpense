import { randomUUID } from "node:crypto";
import type { RentalContractDetail, RentalMeterReadingInput } from "@xpense/shared";

import type { ChargeTermsRepository } from "../modules/rental/charge-terms.repository.js";
import type { FinanceRequestsRepository } from "../modules/rental/finance-requests.repository.js";
import type { MeterReadingsRepository } from "../modules/rental/meter-readings.repository.js";
import type { RentalCashRepository } from "../modules/rental/rental-cash.repository.js";
import type { RentalCashRecord } from "../modules/rental/rental-cash.repository.types.js";
import type { RentalCashProjectionRepository } from "../modules/rental/rental-cash-projection.repository.js";
import type { RentalCashProjectionFacts } from "../modules/rental/rental-cash-projection.repository.types.js";
import type { RentalFinanceSnapshot } from "../modules/rental/rental-finance.types.js";
import type { RentalSettlementsRepository } from "../modules/rental/rental-settlements.repository.js";
import type { RentalSettlementRecord } from "../modules/rental/rental-settlements.repository.types.js";
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
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
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
  const cashRepository: Partial<RentalCashRepository> = {
    findContractIdByEntryId: async (organizationId, entryId) =>
      state.cashEntries.find(
        (entry) => entry.organizationId === organizationId && entry.id === entryId,
      )?.contractId ?? null,
    list: async (scope, target, page) => {
      const matches = state.cashEntries.filter(
        (entry) =>
          entry.organizationId === scope.organizationId &&
          entry.contractId === scope.contractId &&
          (target.kind === "bill"
            ? entry.billId === target.billId
            : entry.settlementId === target.settlementId),
      );
      const pageNumber = Math.max(1, Math.trunc(page.page));
      const pageSize = Math.min(100, Math.max(1, Math.trunc(page.pageSize)));
      return {
        items: structuredClone(matches)
          .toSorted(
            (left, right) =>
              right.occurredOn.localeCompare(left.occurredOn) ||
              right.createdAt.getTime() - left.createdAt.getTime(),
          )
          .slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        total: matches.length,
        page: pageNumber,
        pageSize,
      };
    },
    allForContract: async (scope) =>
      structuredClone(
        state.cashEntries
          .filter(
            (entry) =>
              entry.organizationId === scope.organizationId &&
              entry.contractId === scope.contractId,
          )
          .toSorted(
            (left, right) =>
              left.occurredOn.localeCompare(right.occurredOn) ||
              left.createdAt.getTime() - right.createdAt.getTime(),
          ),
      ),
    insert: async (scope, input, actor) => {
      const record = {
        id: randomUUID(),
        ...scope,
        billId: input.target.kind === "bill" ? input.target.billId : null,
        settlementId: input.target.kind === "settlement" ? input.target.settlementId : null,
        kind: input.kind,
        purpose: input.purpose,
        amountMinor: input.amountMinor,
        occurredOn: input.occurredOn,
        note: input.note,
        createdByUserId: actor.userId,
        createdAt: new Date(),
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      } satisfies RentalCashRecord;
      state.cashEntries.push(record);
      return structuredClone(record);
    },
    revoke: async (scope, entryId, reason, actor) => {
      const entry = state.cashEntries.find(
        (candidate) =>
          candidate.organizationId === scope.organizationId &&
          candidate.contractId === scope.contractId &&
          candidate.id === entryId &&
          candidate.revokedAt === null,
      );
      if (!entry) throw new Error("Current rental cash entry changed or is outside contract scope");
      Object.assign(entry, {
        revokedAt: new Date(),
        revokedByUserId: actor.userId,
        revokeReason: reason,
      });
      return structuredClone(entry);
    },
  };
  const settlementsRepository: Partial<RentalSettlementsRepository> = {
    findContractId: async (organizationId, settlementId) =>
      state.settlements.find(
        (record) => record.organizationId === organizationId && record.id === settlementId,
      )?.contractId ?? null,
    findCurrent: async (scope) =>
      structuredClone(
        state.settlements.find(
          (record) =>
            record.organizationId === scope.organizationId &&
            record.contractId === scope.contractId,
        ) ?? null,
      ),
    billIds: async (scope, settlementId) =>
      state.settlementBills
        .filter(
          (link) =>
            link.organizationId === scope.organizationId &&
            link.contractId === scope.contractId &&
            link.settlementId === settlementId,
        )
        .map(({ billId }) => billId)
        .toSorted(),
    revise: async (scope, settlementId, projection, actor) => {
      const current = state.settlements.find(
        (record) =>
          record.organizationId === scope.organizationId &&
          record.contractId === scope.contractId &&
          record.id === settlementId,
      );
      if (!current) throw new Error("Rental settlement not found in contract scope");
      state.settlementRevisions.push({
        id: randomUUID(),
        ...scope,
        settlementId,
        revision: current.revision,
        snapshot: structuredClone(current),
        reason: projection.reason ?? null,
        createdByUserId: actor.userId,
        createdAt: new Date(),
      });
      Object.assign(current, {
        effectiveEndDate: projection.plan.effectiveEndDate,
        version: projection.version,
        revision: current.revision + 1,
        finalCostMinor: projection.plan.finalCostMinor,
        status: projection.status,
        snapshot: structuredClone(projection.plan) as RentalSettlementRecord["snapshot"],
        updatedAt: new Date(),
      });
      return structuredClone(current);
    },
  };
  const cashProjectionRepository: Partial<RentalCashProjectionRepository> = {
    readMany: async (organizationId, contractIds) =>
      contractIds.flatMap((contractId) => {
        const contract = state.contracts.get(contractId);
        if (!contract || contract.organizationId !== organizationId) return [];
        const settlement =
          state.settlements.find(
            (record) =>
              record.organizationId === organizationId && record.contractId === contractId,
          ) ?? null;
        return [
          {
            organizationId,
            contractId,
            contract: {
              billingMode: contract.billingMode,
              lifecycleStatus: contract.status,
              startDate: contract.startDate,
              endDate: contract.endDate,
              rentAmountMinor: contract.rentAmountMinor,
              billingAnchor: contract.billingAnchor,
              paymentIntervalMonths: contract.paymentIntervalMonths,
              dueDaysBefore: contract.dueDaysBefore,
              terminationDate: contract.terminationDate,
              cancelledAt: contract.cancelledAt,
            },
            bills: state.bills
              .filter(
                (bill) => bill.organizationId === organizationId && bill.contractId === contractId,
              )
              .map((bill) => ({
                id: bill.id,
                type: bill.type,
                status: bill.status,
                modelVersion: bill.modelVersion ?? 1,
                billingMonth: bill.billingMonth ?? null,
                revision: bill.revision ?? 1,
                amountMinor: bill.amountMinor,
                sourceKey: bill.sourceKey,
                dueDate: bill.dueDate,
              })),
            cashEntries: state.cashEntries
              .filter(
                (entry) =>
                  entry.organizationId === organizationId && entry.contractId === contractId,
              )
              .map((entry) => ({
                id: entry.id,
                contractId: entry.contractId,
                billId: entry.billId,
                settlementId: entry.settlementId,
                kind: entry.kind,
                purpose: entry.purpose,
                amountMinor: entry.amountMinor,
                occurredOn: entry.occurredOn,
                revokedAt: entry.revokedAt,
              })),
            settlement: settlement
              ? {
                  id: settlement.id,
                  eventId: settlement.eventId,
                  kind: settlement.kind,
                  effectiveEndDate: settlement.effectiveEndDate,
                  revision: settlement.revision,
                  finalCostMinor: settlement.finalCostMinor,
                  status: settlement.status,
                }
              : null,
            settlementBillIds: settlement
              ? state.settlementBills
                  .filter(
                    (link) =>
                      link.organizationId === organizationId &&
                      link.contractId === contractId &&
                      link.settlementId === settlement.id,
                  )
                  .map(({ billId }) => billId)
                  .toSorted()
              : [],
            readings: state.meterReadings
              .filter(
                (reading) =>
                  reading.organizationId === organizationId && reading.contractId === contractId,
              )
              .map(({ id, kind, readingDate, reading, revision, predecessorId }) => ({
                id,
                kind,
                readingDate,
                reading,
                revision,
                predecessorId,
              })),
          } satisfies RentalCashProjectionFacts,
        ];
      }),
  };
  return {
    chargeTermsRepository,
    meterReadingsRepository,
    financeRequestsRepository,
    cashRepository,
    settlementsRepository,
    cashProjectionRepository,
  };
}
