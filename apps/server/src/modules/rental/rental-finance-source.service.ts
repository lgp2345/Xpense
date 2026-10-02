import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { organizations } from "../../db/schema.js";
import { BillsRepository } from "./bills.repository.js";
import { ChargeTermsRepository } from "./charge-terms.repository.js";
import { organizationDate } from "./contract-date.rules.js";
import { toContractDetail } from "./contract-read-model.js";
import { ContractsRepository } from "./contracts.repository.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import { calculateRentalBalance } from "./rental-balance.rules.js";
import { RentalCashRepository } from "./rental-cash.repository.js";
import type { FinanceScope, RentalFinanceSnapshot } from "./rental-finance.types.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";

function isoDateTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

@Injectable()
export class RentalFinanceSourceService {
  constructor(
    private readonly contracts: ContractsRepository,
    private readonly bills: BillsRepository,
    private readonly terms: ChargeTermsRepository,
    private readonly readings: MeterReadingsRepository,
    private readonly cash: RentalCashRepository,
    private readonly settlements: RentalSettlementsRepository,
  ) {}

  async read(scope: FinanceScope, executor: AppDbExecutor): Promise<RentalFinanceSnapshot> {
    const [organization] = await executor
      .select({ baseCurrency: organizations.baseCurrency, timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, scope.organizationId))
      .limit(1);
    if (!organization) throw this.notFound();

    let today: string;
    try {
      today = organizationDate(new Date(), organization.timezone);
    } catch (error) {
      throw new RangeError(error instanceof Error ? error.message : "组织时区无效");
    }
    const [detail, header] = await Promise.all([
      this.contracts.detail(scope.organizationId, scope.contractId, today, executor),
      this.contracts.find(scope.organizationId, scope.contractId, executor),
    ]);
    if (!detail || !header) throw this.notFound();

    const contract = {
      ...toContractDetail(detail),
      billingMode: detail.billingMode ?? "legacy_receivable",
    };
    const [termsRecord, readingRecords, bills, cashRecords, settlementRecord] = await Promise.all([
      this.terms.find(scope, executor),
      this.readings.list(scope, executor),
      this.bills.allForContract(scope.organizationId, scope.contractId, executor),
      this.cash.allForContract(scope, executor),
      this.settlements.findCurrent(scope, executor),
    ]);
    const terms = termsRecord
      ? {
          contractId: termsRecord.contractId,
          version: String(termsRecord.version),
          waterCollectionEnabled: termsRecord.waterCollectionEnabled ?? true,
          electricityCollectionEnabled: termsRecord.electricityCollectionEnabled ?? true,
          waterUnitPrice: termsRecord.waterUnitPrice,
          electricityUnitPrice: termsRecord.electricityUnitPrice,
          fixedFees: termsRecord.fixedFees,
        }
      : null;
    const readings = readingRecords.map((record) => ({
      id: record.id,
      contractId: record.contractId,
      spaceId: record.spaceId,
      kind: record.kind,
      readingDate: record.readingDate,
      reading: record.reading,
      revision: record.revision,
      predecessorId: record.predecessorId,
    }));
    const cashEntries = cashRecords.map((record) => ({
      id: record.id,
      contractId: record.contractId,
      target: record.billId
        ? ({ kind: "bill", billId: record.billId } as const)
        : record.settlementId
          ? ({ kind: "settlement", settlementId: record.settlementId } as const)
          : this.invalidCashTarget(),
      kind: record.kind,
      purpose: record.purpose,
      amountMinor: record.amountMinor,
      occurredOn: record.occurredOn,
      note: record.note,
      createdAt: record.createdAt.toISOString(),
      createdByUserId: record.createdByUserId,
      revokedAt: isoDateTime(record.revokedAt),
      revokedByUserId: record.revokedByUserId,
      revokeReason: record.revokeReason,
    }));
    const settlement = settlementRecord
      ? this.toSettlement(settlementRecord, cashEntries, today)
      : null;

    return {
      context: {
        organizationId: scope.organizationId,
        contractId: scope.contractId,
        today,
        currencyCode: organization.baseCurrency,
        timezone: organization.timezone,
      },
      contract,
      terms,
      readings,
      bills,
      cashEntries,
      settlement,
      cancelledOn: header.cancelledAt
        ? organizationDate(header.cancelledAt, organization.timezone)
        : null,
    };
  }

  private toSettlement(
    record: Awaited<ReturnType<RentalSettlementsRepository["findCurrent"]>> & {},
    cashEntries: RentalFinanceSnapshot["cashEntries"],
    today: string,
  ): NonNullable<RentalFinanceSnapshot["settlement"]> {
    const received = cashEntries
      .filter((entry) => entry.kind === "receipt" && entry.revokedAt === null)
      .reduce((total, entry) => total + BigInt(entry.amountMinor), 0n);
    const refunded = cashEntries
      .filter((entry) => entry.kind === "refund" && entry.revokedAt === null)
      .reduce((total, entry) => total + BigInt(entry.amountMinor), 0n);
    const balance = calculateRentalBalance(
      record.finalCostMinor,
      Number(received),
      Number(refunded),
      null,
      today,
    );
    return {
      id: record.id,
      contractId: record.contractId,
      eventId: record.eventId,
      kind: record.kind,
      effectiveEndDate: record.effectiveEndDate,
      version: record.version,
      revision: record.revision,
      finalCostMinor: record.finalCostMinor,
      balance: { ...balance, overdue: false, version: record.version },
      status: record.status,
      confirmedAt: record.confirmedAt.toISOString(),
      confirmedByUserId: record.confirmedByUserId,
    };
  }

  private invalidCashTarget(): never {
    throw new Error("Rental cash record has no scoped target");
  }

  private notFound() {
    return new NotFoundException({ code: apiErrorCodes.notFound, message: "租赁合同不存在" });
  }
}
