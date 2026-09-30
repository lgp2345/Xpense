import { NotFoundException } from "@nestjs/common";
import type { RentalBillDetail } from "@xpense/shared";
import { BillsRepository } from "../modules/rental/bills.repository.js";
import type { BillRecord } from "../modules/rental/bills.repository.types.js";
import { calculateRentalBalance } from "../modules/rental/rental-balance.rules.js";
import type { RentalFinanceSnapshot } from "../modules/rental/rental-finance.types.js";
import { RentalFinanceSourceService } from "../modules/rental/rental-finance-source.service.js";
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

  const billsRepository: Partial<BillsRepository> = {
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
  Object.assign(setup.app.get(BillsRepository), billsRepository);

  const source: Partial<RentalFinanceSourceService> = {
    read: async (scope) => {
      if (scope.organizationId !== organizationId || scope.contractId !== contractId)
        throw new NotFoundException("租赁合同不存在");
      const header = state.contracts.get(contractId);
      if (!header || header.organizationId !== organizationId)
        throw new NotFoundException("租赁合同不存在");
      const terms = state.chargeTerms.get(`${organizationId}/${contractId}`);
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
          billingMode: header.billingMode,
          lifecycleStatus: header.status,
          startDate: header.startDate,
          endDate: header.endDate,
          rentAmountMinor: header.rentAmountMinor,
          billingAnchor: header.billingAnchor,
          paymentIntervalMonths:
            header.paymentIntervalMonths as RentalFinanceSnapshot["contract"]["paymentIntervalMonths"],
          dueDaysBefore: header.dueDaysBefore,
          terminationDate: header.terminationDate,
          spaces: structuredClone(setup.source.contract.spaces),
        },
        terms: terms
          ? {
              contractId,
              version: String(terms.version),
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
        cancelledOn: null,
      };
      lastSnapshot = snapshot;
      return snapshot;
    },
  };
  Object.assign(setup.app.get(RentalFinanceSourceService), source);

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
