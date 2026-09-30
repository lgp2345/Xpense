import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import {
  rentalBills,
  rentalCashEntries,
  rentalContracts,
  rentalMeterReadings,
  rentalSettlementBills,
  rentalSettlements,
} from "../../db/schema.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

/** 以固定批量查询加载多个合同的完整资金版本事实，始终限于一个组织和明确合同集。 */
@Injectable()
export class RentalCashProjectionRepository {
  async readMany(
    organizationId: string,
    contractIds: string[],
    executor: AppDbExecutor,
  ): Promise<RentalCashProjectionFacts[]> {
    const ids = [...new Set(contractIds)];
    if (ids.length === 0) return [];
    const scope = (contractId: typeof rentalContracts.id) =>
      and(eq(rentalContracts.organizationId, organizationId), inArray(contractId, ids));

    const [contracts, bills, cashEntries, settlements, links, readings] = await Promise.all([
      executor
        .select({
          organizationId: rentalContracts.organizationId,
          contractId: rentalContracts.id,
          billingMode: rentalContracts.billingMode,
          lifecycleStatus: rentalContracts.status,
          startDate: rentalContracts.startDate,
          endDate: rentalContracts.endDate,
          rentAmountMinor: rentalContracts.rentAmountMinor,
          billingAnchor: rentalContracts.billingAnchor,
          paymentIntervalMonths: rentalContracts.paymentIntervalMonths,
          dueDaysBefore: rentalContracts.dueDaysBefore,
          terminationDate: rentalContracts.terminationDate,
          cancelledAt: rentalContracts.cancelledAt,
        })
        .from(rentalContracts)
        .where(scope(rentalContracts.id)),
      executor
        .select({
          organizationId: rentalBills.organizationId,
          contractId: rentalBills.contractId,
          id: rentalBills.id,
          type: rentalBills.type,
          status: rentalBills.status,
          modelVersion: rentalBills.modelVersion,
          billingMonth: rentalBills.billingMonth,
          revision: rentalBills.revision,
          amountMinor: rentalBills.amountMinor,
          sourceKey: rentalBills.sourceKey,
          dueDate: rentalBills.dueDate,
        })
        .from(rentalBills)
        .where(
          and(eq(rentalBills.organizationId, organizationId), inArray(rentalBills.contractId, ids)),
        )
        .orderBy(asc(rentalBills.contractId), asc(rentalBills.id)),
      executor
        .select({
          organizationId: rentalCashEntries.organizationId,
          contractId: rentalCashEntries.contractId,
          id: rentalCashEntries.id,
          billId: rentalCashEntries.billId,
          settlementId: rentalCashEntries.settlementId,
          kind: rentalCashEntries.kind,
          purpose: rentalCashEntries.purpose,
          amountMinor: rentalCashEntries.amountMinor,
          occurredOn: rentalCashEntries.occurredOn,
          revokedAt: rentalCashEntries.revokedAt,
        })
        .from(rentalCashEntries)
        .where(
          and(
            eq(rentalCashEntries.organizationId, organizationId),
            inArray(rentalCashEntries.contractId, ids),
          ),
        )
        .orderBy(
          asc(rentalCashEntries.contractId),
          asc(rentalCashEntries.occurredOn),
          asc(rentalCashEntries.id),
        ),
      executor
        .select({
          organizationId: rentalSettlements.organizationId,
          contractId: rentalSettlements.contractId,
          id: rentalSettlements.id,
          eventId: rentalSettlements.eventId,
          kind: rentalSettlements.kind,
          effectiveEndDate: rentalSettlements.effectiveEndDate,
          revision: rentalSettlements.revision,
          finalCostMinor: rentalSettlements.finalCostMinor,
          status: rentalSettlements.status,
        })
        .from(rentalSettlements)
        .where(
          and(
            eq(rentalSettlements.organizationId, organizationId),
            inArray(rentalSettlements.contractId, ids),
          ),
        ),
      executor
        .select({
          organizationId: rentalSettlementBills.organizationId,
          contractId: rentalSettlementBills.contractId,
          settlementId: rentalSettlementBills.settlementId,
          billId: rentalSettlementBills.billId,
        })
        .from(rentalSettlementBills)
        .where(
          and(
            eq(rentalSettlementBills.organizationId, organizationId),
            inArray(rentalSettlementBills.contractId, ids),
          ),
        )
        .orderBy(
          asc(rentalSettlementBills.contractId),
          asc(rentalSettlementBills.settlementId),
          asc(rentalSettlementBills.billId),
        ),
      executor
        .select({
          organizationId: rentalMeterReadings.organizationId,
          contractId: rentalMeterReadings.contractId,
          id: rentalMeterReadings.id,
          kind: rentalMeterReadings.kind,
          readingDate: rentalMeterReadings.readingDate,
          reading: rentalMeterReadings.reading,
          revision: rentalMeterReadings.revision,
          predecessorId: rentalMeterReadings.predecessorId,
        })
        .from(rentalMeterReadings)
        .where(
          and(
            eq(rentalMeterReadings.organizationId, organizationId),
            inArray(rentalMeterReadings.contractId, ids),
          ),
        )
        .orderBy(
          asc(rentalMeterReadings.contractId),
          asc(rentalMeterReadings.kind),
          asc(rentalMeterReadings.readingDate),
          asc(rentalMeterReadings.id),
        ),
    ]);

    const contractById = new Map(contracts.map((record) => [record.contractId, record]));
    const billsByContract = groupBy(bills, (record) => record.contractId);
    const cashByContract = groupBy(cashEntries, (record) => record.contractId);
    const settlementByContract = new Map(settlements.map((record) => [record.contractId, record]));
    const linksByContract = groupBy(links, (record) => record.contractId);
    const readingsByContract = groupBy(readings, (record) => record.contractId);

    return ids.flatMap((contractId) => {
      const contract = contractById.get(contractId);
      if (!contract) return [];
      const settlement = settlementByContract.get(contractId) ?? null;
      const settlementBillIds = (linksByContract.get(contractId) ?? [])
        .filter((link) => link.settlementId === settlement?.id)
        .map((link) => link.billId)
        .sort();
      return [
        {
          organizationId,
          contractId,
          contract: {
            billingMode: contract.billingMode,
            lifecycleStatus: contract.lifecycleStatus,
            startDate: contract.startDate,
            endDate: contract.endDate,
            rentAmountMinor: contract.rentAmountMinor,
            billingAnchor: contract.billingAnchor,
            paymentIntervalMonths: contract.paymentIntervalMonths,
            dueDaysBefore: contract.dueDaysBefore,
            terminationDate: contract.terminationDate,
            cancelledAt: contract.cancelledAt,
          },
          bills: billsByContract.get(contractId) ?? [],
          cashEntries: cashByContract.get(contractId) ?? [],
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
          settlementBillIds,
          readings: readingsByContract.get(contractId) ?? [],
        } satisfies RentalCashProjectionFacts,
      ];
    });
  }
}

function groupBy<T, K>(values: T[], key: (value: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), value]);
  }
  return grouped;
}
