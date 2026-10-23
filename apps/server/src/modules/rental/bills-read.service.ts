import { Injectable, NotFoundException } from "@nestjs/common";
import type { RentalBillDetail, RentalBillPage, RentalBillSummary } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AccessService } from "../iam/access.service.js";
import {
  calculateBillFinancialTotals,
  calculateBillFinancialTotalsByCurrency,
} from "./bill-financial-summary.rules.js";
import { withBillFinancial } from "./bills.queries.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import type { BillDetailDto } from "./dto/bill-detail.dto.js";
import type { ListBillsDto } from "./dto/list-bills.dto.js";
import { periodBillVoidBlockedReason } from "./period-bill-lifecycle.rules.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";
import { financeSourceVersion } from "./rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";

function dueState<T extends RentalBillSummary>(bill: T, today: string): T {
  return {
    ...bill,
    dueState:
      bill.status === "voided"
        ? null
        : bill.dueDate < today
          ? "date_passed"
          : bill.dueDate === today
            ? "due_today"
            : "upcoming",
  };
}

/** 组织锁下的一致只读账单、分类汇总及覆盖查询。 */
@Injectable()
export class BillsReadService {
  constructor(
    private readonly bills: BillsRepository,
    private readonly projectionSources: RentalCashProjectionRepository,
    private readonly sources: RentalFinanceSourceService,
    private readonly policy: ContractsPolicyService,
    private readonly access: AccessService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  list(auth: AuthContext, dto: ListBillsDto): Promise<RentalBillPage> {
    this.access.assertPermission(auth, "rental_bills:read");
    return this.transactions.run(async (tx) => {
      const { today } = await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const page = await this.bills.list(auth.organizationId, dto, tx);
      // Prepare full-filter facts; aggregate cash fields below follow policy A's selected bill and settlement scopes.
      const matchingBills = await this.bills.matchingFinancialBills(auth.organizationId, dto, tx);
      const financialBills = matchingBills;
      const contractIds = [...new Set(financialBills.map(({ contractId }) => contractId))];
      const requestedContractIds = new Set(contractIds);
      const facts: RentalCashProjectionFacts[] = [];
      for (let offset = 0; offset < contractIds.length; offset += 500) {
        const batch = contractIds.slice(offset, offset + 500);
        facts.push(...(await this.projectionSources.readMany(auth.organizationId, batch, tx)));
      }
      const factsByContract = new Map(facts.map((item) => [item.contractId, item]));
      if (
        facts.length !== factsByContract.size ||
        facts.some(
          (item) =>
            item.organizationId !== auth.organizationId ||
            !requestedContractIds.has(item.contractId),
        )
      ) {
        throw new Error("Rental bill finance facts do not match the requested scope");
      }
      const byCurrency = page.totals.byCurrency
        ? calculateBillFinancialTotalsByCurrency(matchingBills, facts, auth.organizationId, today)
        : undefined;
      const financialTotals =
        !byCurrency || byCurrency.length <= 1
          ? calculateBillFinancialTotals(matchingBills, facts, auth.organizationId, today)
          : null;
      const financialByCurrency = new Map(
        byCurrency?.map(({ currencyCode, ...financial }) => [currencyCode, financial] as const),
      );
      const groupedTotals = byCurrency
        ? page.totals.byCurrency?.map((group) => ({
            ...group,
            financial: financialByCurrency.get(group.currencyCode),
          }))
        : undefined;
      return {
        ...page,
        totals: {
          ...page.totals,
          ...(financialTotals ? { financial: financialTotals } : {}),
          ...(groupedTotals ? { byCurrency: groupedTotals } : {}),
        },
        coverage: null,
        items: page.items.map((bill) => {
          const contractFacts = factsByContract.get(bill.contractId);
          if (!contractFacts) throw new Error("Rental bill finance facts could not be loaded");
          const withFinancial = contractFacts
            ? withBillFinancial(bill, contractFacts, today, auth.organizationId)
            : bill;
          return dueState(this.withVoidState(withFinancial, contractFacts!), today);
        }),
      };
    });
  }

  detail(auth: AuthContext, dto: BillDetailDto): Promise<RentalBillDetail> {
    this.access.assertPermission(auth, "rental_bills:read");
    return this.transactions.run(async (tx) => {
      const { today } = await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const bill = await this.bills.detail(auth.organizationId, dto.id, tx);
      if (!bill)
        throw new NotFoundException({ code: apiErrorCodes.notFound, message: "租赁账单不存在" });
      const facts = (
        await this.projectionSources.readMany(auth.organizationId, [bill.contractId], tx)
      )[0];
      if (!facts) throw new Error("Rental bill finance facts could not be loaded");
      const source = await this.sources.read(
        { organizationId: auth.organizationId, contractId: bill.contractId },
        tx,
      );
      const mappedBill = facts ? withBillFinancial(bill, facts, today, auth.organizationId) : bill;
      return {
        ...dueState(this.withVoidState(mappedBill, facts), today),
        version: financeSourceVersion(source, { billId: bill.id }),
        history: bill.history.map((item) =>
          dueState(
            facts ? withBillFinancial(item, facts, today, auth.organizationId) : item,
            today,
          ),
        ),
      };
    });
  }
  private withVoidState<T extends RentalBillSummary>(bill: T, facts: RentalCashProjectionFacts): T {
    const reason = periodBillVoidBlockedReason(
      {
        bills: facts.bills,
        cashEntries: facts.cashEntries.map((entry) => ({
          revokedAt: entry.revokedAt,
          target: entry.billId
            ? { kind: "bill", billId: entry.billId }
            : { kind: "settlement", settlementId: entry.settlementId! },
        })),
        settlement: facts.settlement,
      },
      bill.id,
    );
    return { ...bill, canVoid: reason === null, voidBlockedReason: reason };
  }
}
