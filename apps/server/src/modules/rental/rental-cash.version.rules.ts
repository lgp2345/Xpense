import type { RentalCashTarget } from "@xpense/shared";

import { financeSourceVersion } from "./rental-finance-request.rules.js";

export type RentalCashVersionFacts = {
  organizationId: string;
  contractId: string;
  contract: {
    billingMode: string | null;
    lifecycleStatus: string | null;
    terminationDate: string | null;
    startDate?: string | null;
    endDate?: string | null;
    cancelledAt?: Date | string | null;
  };
  bills: Array<{
    id: string;
    type: string;
    status: string;
    modelVersion: number | null;
    revision: number | null;
    amountMinor: number;
    sourceKey: string | null;
  }>;
  cashEntries: Array<{
    id: string;
    target?: RentalCashTarget;
    billId?: string | null;
    settlementId?: string | null;
    kind: string;
    purpose: string;
    amountMinor: number;
    occurredOn: string;
    revokedAt: Date | string | null;
  }>;
  settlement: {
    id: string;
    eventId: string;
    kind: string;
    effectiveEndDate: string;
    revision: number;
    finalCostMinor: number;
    status: string;
  } | null;
  settlementBillIds: string[];
  readings: Array<{
    id: string;
    kind: string;
    readingDate: string;
    reading: string;
    revision: number;
    predecessorId: string | null;
  }>;
};

/** 按持久化财务事实和唯一目标生成版本，不含本次请求内容或派生读模型字段。 */
export function rentalCashSourceVersion(
  facts: RentalCashVersionFacts,
  target: RentalCashTarget,
): string {
  const persistentSource = {
    organizationId: facts.organizationId,
    contractId: facts.contractId,
    contract: {
      billingMode: facts.contract.billingMode,
      lifecycleStatus: facts.contract.lifecycleStatus,
      terminationDate: facts.contract.terminationDate,
      startDate: facts.contract.startDate ?? null,
      endDate: facts.contract.endDate ?? null,
      cancelledAt: facts.contract.cancelledAt ?? null,
    },
    bills: [...facts.bills]
      .map(({ id, type, status, modelVersion, revision, amountMinor, sourceKey }) => ({
        id,
        type,
        status,
        modelVersion,
        revision,
        amountMinor,
        sourceKey,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    cashEntries: [...facts.cashEntries]
      .map((entry) => ({
        id: entry.id,
        target:
          entry.target ??
          (entry.billId
            ? ({ kind: "bill", billId: entry.billId } as const)
            : entry.settlementId
              ? ({ kind: "settlement", settlementId: entry.settlementId } as const)
              : null),
        kind: entry.kind,
        purpose: entry.purpose,
        amountMinor: entry.amountMinor,
        occurredOn: entry.occurredOn,
        revokedAt: entry.revokedAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    settlement: facts.settlement
      ? {
          id: facts.settlement.id,
          eventId: facts.settlement.eventId,
          kind: facts.settlement.kind,
          effectiveEndDate: facts.settlement.effectiveEndDate,
          revision: facts.settlement.revision,
          finalCostMinor: facts.settlement.finalCostMinor,
          status: facts.settlement.status,
        }
      : null,
    settlementBillIds: [...facts.settlementBillIds].sort(),
    readings: [...facts.readings]
      .map(({ id, kind, readingDate, reading, revision, predecessorId }) => ({
        id,
        kind,
        readingDate,
        reading,
        revision,
        predecessorId,
      }))
      .sort((left, right) =>
        `${left.kind}:${left.readingDate}:${left.id}`.localeCompare(
          `${right.kind}:${right.readingDate}:${right.id}`,
        ),
      ),
    target,
  };
  return financeSourceVersion(persistentSource, {});
}
