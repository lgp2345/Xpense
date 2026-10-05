import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import type { ListRentalBillsQuery, RentalBillDetail } from "@xpense/shared";
import type {
  BillRevisionAppendResult,
  BillRevisionRecord,
} from "../modules/rental/bill-revisions.repository.js";
import { BillRevisionsRepository } from "../modules/rental/bill-revisions.repository.js";
import { toBillingContractDates } from "../modules/rental/billing-contract-dates.rules.js";
import { BillsRepository } from "../modules/rental/bills.repository.js";
import type { BillRecord } from "../modules/rental/bills.repository.types.js";
import { organizationDate } from "../modules/rental/contract-date.rules.js";
import { actualContractEndTime } from "../modules/rental/contract-time.rules.js";
import type { MeterReadingWriteInput } from "../modules/rental/meter-readings.repository.js";
import { MeterReadingsRepository } from "../modules/rental/meter-readings.repository.js";
import { calculateRentalBalance } from "../modules/rental/rental-balance.rules.js";
import type {
  FinanceScope,
  RentalFinanceSnapshot,
} from "../modules/rental/rental-finance.types.js";
import { RentalFinanceSourceService } from "../modules/rental/rental-finance-source.service.js";
import { RentalSettlementsRepository } from "../modules/rental/rental-settlements.repository.js";
import type { RentalSettlementRecord } from "../modules/rental/rental-settlements.repository.types.js";
import { login, TEST_PHONES, testIds } from "./auth-test-helpers.js";
import { rentalBillingDetail } from "./rental-billing-fixtures.js";
import { createRentalBillingHttpHarness } from "./rental-billing-http-harness.js";
import { financeContractId, rentalFinanceSnapshot } from "./rental-finance-fixtures.js";
import { rentalTestIds } from "./rental-test-state.js";

type RentalFinanceHttpHarness = Omit<
  Awaited<ReturnType<typeof createRentalBillingHttpHarness>>,
  "request"
> & {
  request: (
    url: string,
    payload?: unknown,
    headers?: Record<string, string>,
    method?: "GET" | "POST",
  ) => Promise<{ payload: string; statusCode: number }>;
  memberHeaders: Record<string, string>;
  financeContractId: string;
  currentSnapshot: () => Promise<RentalFinanceSnapshot>;
};

/** 真正运行 finance services/controller 的 HTTP harness，仓储与事务使用可回滚内存状态。 */
export async function createRentalFinanceHttpHarness(): Promise<RentalFinanceHttpHarness> {
  const setup = await createRentalBillingHttpHarness({ billingMode: "monthly_settlement" });
  const state = setup.state.rental;
  const organizationId = testIds.organization;
  const contractId = rentalTestIds.contract;
  const storedContract = state.contracts.get(contractId);
  if (!storedContract) throw new Error("Monthly finance HTTP fixture contract unavailable");
  state.contracts.set(contractId, { ...storedContract, billingMode: "monthly_settlement" });

  const base = rentalFinanceSnapshot();
  const financeSpaceId = setup.source.contract.spaces[0]?.spaceId ?? rentalTestIds.childSpace;
  const now = new Date("2026-08-01T00:00:00.000Z");
  let lastSnapshot: RentalFinanceSnapshot | null = null;
  state.chargeTerms.set(`${organizationId}/${contractId}`, {
    id: financeContractId,
    organizationId,
    contractId,
    version: 1,
    waterCollectionEnabled: base.terms?.waterCollectionEnabled ?? true,
    electricityCollectionEnabled: base.terms?.electricityCollectionEnabled ?? true,
    waterUnitPrice: base.terms?.waterUnitPrice ?? "3.0000",
    electricityUnitPrice: base.terms?.electricityUnitPrice ?? "4.0000",
    fixedFees: structuredClone(base.terms?.fixedFees ?? []),
    updatedByUserId: testIds.ownerUser,
    updatedAt: now,
  });
  state.meterReadings.push(
    ...base.readings.map((reading) => ({
      ...reading,
      organizationId,
      contractId,
      spaceId: financeSpaceId,
      reason: "入住底数",
      createdByUserId: testIds.ownerUser,
      updatedByUserId: testIds.ownerUser,
      createdAt: now,
      updatedAt: now,
    })),
  );

  const matchingFinancialBills = async (org: string, query: ListRentalBillsQuery) =>
    state.bills
      .filter(
        (bill) =>
          bill.organizationId === org &&
          (!query.contractId || bill.contractId === query.contractId) &&
          (!query.propertyId || bill.propertyId === query.propertyId) &&
          bill.status === (query.status ?? "active") &&
          (!query.type || bill.type === query.type) &&
          (!query.keyword ||
            `${bill.billNumber} ${bill.contractNumber} ${bill.propertyName}`.includes(
              query.keyword,
            )) &&
          (!query.dueDateFrom || bill.dueDate >= query.dueDateFrom) &&
          (!query.dueDateTo || bill.dueDate <= query.dueDateTo),
      )
      .map(({ id, contractId, modelVersion }) => ({
        id,
        contractId,
        modelVersion: modelVersion ?? 1,
      }));

  const billsRepository: Partial<BillsRepository> = {
    matchingFinancialBills,
    insertBills: async (context, billingSource, generationId, drafts, _executor) => {
      state.billCounter += drafts.length;
      const inserted = drafts.map((draft, index) => {
        const detail = rentalBillingDetail(billingSource, draft);
        const billNumber = `RB-2026-${state.billCounter - drafts.length + index + 1}`;
        const createdAt = new Date("2026-08-31T04:00:00.000Z");
        const modelVersion = draft.modelVersion ?? 1;
        const billingMonth = draft.type === "monthly" ? (draft.billingMonth ?? null) : null;
        const revision = draft.revision ?? 1;
        const record: BillRecord = {
          id: detail.id,
          organizationId: context.organizationId,
          contractId: billingSource.contract.id,
          propertyId: billingSource.contract.propertyId,
          billNumber,
          contractNumber: billingSource.contract.contractNumber,
          propertyName: billingSource.contract.propertyName,
          currencyCode: billingSource.currencyCode,
          type: draft.type,
          status: "active",
          modelVersion,
          billingMonth,
          revision,
          sourceKey: draft.sourceKey,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          effectiveEnd: draft.effectiveEnd,
          dueDate: detail.dueDate,
          amountMinor: draft.amountMinor,
          generationId,
          adjustmentId: draft.adjustmentId,
          snapshot: detail.snapshot,
          depositSourceId: draft.depositSourceId,
          depositSnapshot: draft.depositSnapshot,
          voidReason: null,
          voidedAt: null,
          voidedBy: null,
          createdByUserId: context.userId,
          createdAt,
        };
        const storedDetail: RentalBillDetail & { organizationId: string } = {
          ...detail,
          organizationId: context.organizationId,
          billNumber,
          generationId,
          modelVersion,
          billingMonth,
          revision,
          createdAt: createdAt.toISOString(),
        };
        state.bills.push(storedDetail);
        return record;
      });
      return structuredClone(inserted);
    },
  };
  const repository = setup.app.get(BillsRepository);
  const originalList = repository.list.bind(repository);
  billsRepository.list = async (org, query, executor) => {
    const page = await originalList(org, query, executor);
    const matchingIds = new Set((await matchingFinancialBills(org, query)).map(({ id }) => id));
    const monthlyBills = state.bills.filter(
      (bill) => matchingIds.has(bill.id) && bill.type === "monthly" && bill.status === "active",
    );
    // Mirror the SQL fee composition seam; cash totals still use real services.
    const monthlyRent = monthlyBills.reduce(
      (total, bill) =>
        total +
        bill.lines.reduce(
          (sum, line) => sum + (line.kind === "rent_period" ? line.amountMinor : 0),
          0,
        ),
      0,
    );
    return {
      ...page,
      totals: {
        ...page.totals,
        rentAmountMinor: page.totals.rentAmountMinor + monthlyRent,
        monthlyAmountMinor: monthlyBills.reduce((total, bill) => total + bill.amountMinor, 0),
      },
    };
  };
  Object.assign(repository, billsRepository);

  const meterReadingsRepository: Partial<MeterReadingsRepository> = {
    appendBoundary: async (
      scope: FinanceScope,
      input: MeterReadingWriteInput,
      reason: string,
      actor: { userId: string },
    ) => {
      const now = new Date(FIXED_FINANCE_NOW);
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
      };
      state.meterReadings.push(record);
      return structuredClone(record);
    },
    reviseBoundary: async (
      scope: FinanceScope,
      id: string,
      input: MeterReadingWriteInput,
      reason: string,
      actor: { userId: string },
    ) => {
      const current = state.meterReadings.find(
        (record) =>
          record.organizationId === scope.organizationId &&
          record.contractId === scope.contractId &&
          record.id === id,
      );
      if (!current) throw new Error("Rental test meter boundary not found in contract scope");
      const now = new Date(FIXED_FINANCE_NOW);
      state.meterReadingRevisions.push({
        id: randomUUID(),
        organizationId: scope.organizationId,
        contractId: scope.contractId,
        readingId: id,
        revision: current.revision,
        snapshot: structuredClone(current),
        reason,
        createdByUserId: actor.userId,
        createdAt: now,
      });
      Object.assign(current, structuredClone(input), {
        revision: current.revision + 1,
        reason,
        updatedByUserId: actor.userId,
        updatedAt: now,
      });
      return structuredClone(current);
    },
  };
  Object.assign(setup.app.get(MeterReadingsRepository), meterReadingsRepository);

  const billRevisionsRepository: Partial<BillRevisionsRepository> = {
    append: async (
      scope: FinanceScope,
      billId: string,
      lines: RentalBillDetail["lines"],
      amountMinor: number,
      reason: string,
      actor: { userId: string },
    ) => {
      const bill = state.bills.find(
        (item) =>
          item.organizationId === scope.organizationId &&
          item.contractId === scope.contractId &&
          item.id === billId,
      );
      if (!bill) throw new Error("Rental test bill not found in contract scope");
      const previousRevision = bill.revision ?? 1;
      const revision = {
        id: randomUUID(),
        ...scope,
        billId,
        revision: previousRevision,
        amountMinor: bill.amountMinor,
        billSnapshot: structuredClone(bill),
        linesSnapshot: structuredClone(bill.lines),
        reason,
        createdByUserId: actor.userId,
        createdAt: new Date(FIXED_FINANCE_NOW),
      };
      state.billRevisions.push(revision as BillRevisionRecord);
      Object.assign(bill, {
        amountMinor,
        lines: structuredClone(lines),
        revision: previousRevision + 1,
      });
      return {
        bill: {
          id: billId,
          ...scope,
          amountMinor,
          revision: previousRevision + 1,
        } as BillRevisionAppendResult["bill"],
        revision,
      };
    },
    history: async (
      scope: FinanceScope,
      billId: string,
      page: { page: number; pageSize: number },
    ) => {
      const records = state.billRevisions
        .filter(
          (revision) =>
            revision.organizationId === scope.organizationId &&
            revision.contractId === scope.contractId &&
            revision.billId === billId,
        )
        .toSorted((left, right) => right.revision - left.revision);
      const pageNumber = Math.max(1, Math.trunc(page.page));
      const pageSize = Math.min(100, Math.max(1, Math.trunc(page.pageSize)));
      const offset = (pageNumber - 1) * pageSize;
      return {
        items: structuredClone(records.slice(offset, offset + pageSize)),
        total: records.length,
        page: pageNumber,
        pageSize,
      };
    },
  };
  Object.assign(setup.app.get(BillRevisionsRepository), billRevisionsRepository);

  const source: Partial<RentalFinanceSourceService> = {
    read: async (scope) => {
      if (scope.organizationId !== organizationId) throw new NotFoundException("租赁合同不存在");
      const contractId = scope.contractId;
      const header = state.contracts.get(contractId);
      if (!header || header.organizationId !== organizationId)
        throw new NotFoundException("租赁合同不存在");
      const terms = state.chargeTerms.get(`${organizationId}/${contractId}`);
      const actualEndDate =
        header.endDate === null
          ? null
          : actualContractEndTime(header.endDate, header.terminationDate);
      const bills = state.bills
        .filter((bill) => bill.organizationId === organizationId && bill.contractId === contractId)
        .map(({ organizationId: _organizationId, ...bill }) => structuredClone(bill));
      const cashEntries = state.cashEntries
        .filter(
          (entry) => entry.organizationId === organizationId && entry.contractId === contractId,
        )
        .map((entry) => ({
          id: entry.id,
          contractId: entry.contractId,
          target: entry.billId
            ? ({ kind: "bill", billId: entry.billId } as const)
            : entry.settlementId
              ? ({ kind: "settlement", settlementId: entry.settlementId } as const)
              : (() => {
                  throw new Error("Finance cash fixture requires an exact target");
                })(),
          kind: entry.kind,
          purpose: entry.purpose,
          amountMinor: entry.amountMinor,
          occurredOn: entry.occurredOn,
          note: entry.note,
          createdAt: entry.createdAt.toISOString(),
          createdByUserId: entry.createdByUserId,
          revokedAt: entry.revokedAt?.toISOString() ?? null,
          revokedByUserId: entry.revokedByUserId,
          revokeReason: entry.revokeReason,
        }));
      const settlementRecord = state.settlements.find(
        (record) => record.organizationId === organizationId && record.contractId === contractId,
      );
      const settlement = settlementRecord
        ? ({
            id: settlementRecord.id,
            contractId: settlementRecord.contractId,
            eventId: settlementRecord.eventId,
            kind: settlementRecord.kind,
            effectiveEndDate: settlementRecord.effectiveEndDate,
            version: settlementRecord.version,
            revision: settlementRecord.revision,
            finalCostMinor: settlementRecord.finalCostMinor,
            balance: {
              ...calculateRentalBalance(
                settlementRecord.finalCostMinor,
                safeCashTotal(cashEntries, "receipt"),
                safeCashTotal(cashEntries, "refund"),
                null,
                base.context.today,
              ),
              overdue: false,
              version: settlementRecord.version,
            },
            status: settlementRecord.status,
            confirmedAt: settlementRecord.confirmedAt.toISOString(),
            confirmedByUserId: settlementRecord.confirmedByUserId,
          } satisfies RentalFinanceSnapshot["settlement"])
        : null;
      const snapshot: RentalFinanceSnapshot = {
        ...base,
        context: {
          ...base.context,
          organizationId,
          contractId,
          today: setup.source.today,
          currencyCode: setup.source.currencyCode,
          timezone: setup.source.timezone,
        },
        contract: {
          ...base.contract,
          ...setup.source.contract,
          id: contractId,
          contractNumber: header.contractNumber,
          depositTerms: structuredClone(state.deposits.get(contractId) ?? []),
          billingMode: header.billingMode,
          lifecycleStatus: header.status,
          rentAmountMinor: header.rentAmountMinor,
          billingAnchor: header.billingAnchor,
          paymentIntervalMonths:
            header.paymentIntervalMonths as RentalFinanceSnapshot["contract"]["paymentIntervalMonths"],
          dueDaysBefore: header.dueDaysBefore,
          terminationDate: header.terminationDate,
          spaces: structuredClone(setup.source.contract.spaces),
          ...toBillingContractDates({
            startDate: header.startDate,
            endDate: header.endDate,
            actualEndDate,
          }),
        },
        terms: terms
          ? {
              contractId,
              version: String(terms.version),
              waterCollectionEnabled: terms.waterCollectionEnabled,
              electricityCollectionEnabled: terms.electricityCollectionEnabled,
              waterUnitPrice: terms.waterUnitPrice,
              electricityUnitPrice: terms.electricityUnitPrice,
              fixedFees: structuredClone(terms.fixedFees),
            }
          : null,
        readings: state.meterReadings
          .filter(
            (reading) =>
              reading.organizationId === organizationId && reading.contractId === contractId,
          )
          .map(
            ({
              organizationId: _org,
              reason: _reason,
              createdByUserId: _createdBy,
              updatedByUserId: _updatedBy,
              createdAt: _createdAt,
              updatedAt: _updatedAt,
              ...reading
            }) => structuredClone(reading),
          ),
        bills,
        cashEntries,
        settlement,
        cancelledOn: header.cancelledAt
          ? organizationDate(header.cancelledAt, setup.source.timezone)
          : null,
      };
      lastSnapshot = snapshot;
      return snapshot;
    },
  };
  Object.assign(setup.app.get(RentalFinanceSourceService), source);

  const settlements: Partial<RentalSettlementsRepository> = {
    create: async (scope, plan, event, actor) => {
      const now = new Date(FIXED_FINANCE_NOW);
      const record = {
        id: event.settlementId ?? randomUUID(),
        ...scope,
        eventId: event.eventId,
        kind: event.kind,
        effectiveEndDate: plan.effectiveEndDate,
        version: event.version,
        revision: 1,
        finalCostMinor: plan.finalCostMinor,
        status: event.status,
        snapshot: structuredClone(plan),
        confirmedAt: now,
        confirmedByUserId: actor.userId,
        updatedAt: now,
      } as RentalSettlementRecord;
      state.settlements.push(record);
      return structuredClone(record);
    },
    linkBills: async (scope, settlementId, billIds) => {
      state.settlementBills = state.settlementBills.filter(
        (link) =>
          link.organizationId !== scope.organizationId ||
          link.contractId !== scope.contractId ||
          link.settlementId !== settlementId,
      );
      for (const billId of new Set(billIds))
        state.settlementBills.push({
          ...scope,
          settlementId,
          billId,
          createdAt: new Date(FIXED_FINANCE_NOW),
        });
    },
    history: async (scope, page) => {
      const records = state.settlementRevisions
        .filter(
          (revision) =>
            revision.organizationId === scope.organizationId &&
            revision.contractId === scope.contractId,
        )
        .toSorted(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() || right.revision - left.revision,
        );
      const pageNumber = Math.max(1, Math.trunc(page.page));
      const pageSize = Math.min(100, Math.max(1, Math.trunc(page.pageSize)));
      const offset = (pageNumber - 1) * pageSize;
      return {
        items: structuredClone(records.slice(offset, offset + pageSize)),
        total: records.length,
        page: pageNumber,
        pageSize,
      };
    },
  };
  Object.assign(setup.app.get(RentalSettlementsRepository), settlements);

  const memberTokens = await login(setup.app, TEST_PHONES.manager);
  const memberHeaders = { authorization: `Bearer ${memberTokens.accessToken}` };
  const request = async (
    url: string,
    payload?: unknown,
    headers: Record<string, string> = setup.headers,
    method: "GET" | "POST" = payload === undefined ? "GET" : "POST",
  ) =>
    setup.app.inject({
      method,
      url: `/api${url}`,
      headers,
      ...(payload === undefined ? {} : { payload: payload as never }),
    });

  return {
    ...setup,
    request,
    memberHeaders,
    financeContractId: contractId,
    currentSnapshot: async () => {
      if (!lastSnapshot) throw new Error("Monthly finance snapshot has not been read");
      return structuredClone(lastSnapshot);
    },
  };
}

const FIXED_FINANCE_NOW = "2026-08-31T04:00:00.000Z";

function safeCashTotal(
  entries: RentalFinanceSnapshot["cashEntries"],
  kind: "receipt" | "refund",
): number {
  const total = entries
    .filter((entry) => entry.kind === kind && entry.revokedAt === null)
    .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("测试资金事实超出安全整数范围");
  return Number(total);
}
