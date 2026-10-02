import { Injectable, NotFoundException } from "@nestjs/common";
import type { RentalBillDetail, RentalBillPage, RentalBillSummary } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AccessService } from "../iam/access.service.js";
import { calculateBillFinancialTotals } from "./bill-financial-summary.rules.js";
import { billingCoverage } from "./billing-plan.rules.js";
import { BillingSourceService } from "./billing-source.service.js";
import { withBillFinancial } from "./bills.queries.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import type { BillDetailDto } from "./dto/bill-detail.dto.js";
import type { ListBillsDto } from "./dto/list-bills.dto.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";

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
    private readonly sources: BillingSourceService,
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
      if (matchingBills.some((bill) => bill.modelVersion !== 1 && bill.modelVersion !== 2))
        throw new Error("Unsupported rental bill model version");
      const financialBills = matchingBills.filter((bill) => bill.modelVersion === 2);
      const contractIds = [...new Set(financialBills.map(({ contractId }) => contractId))];
      const requestedContractIds = new Set(contractIds);
      const facts: RentalCashProjectionFacts[] = [];
      for (let offset = 0; offset < contractIds.length; offset += 500) {
        const batch = contractIds.slice(offset, offset + 500);
        facts.push(...(await this.projectionSources.readMany(auth.organizationId, batch, tx)));
      }
      const factsByContract = new Map(facts.map((item) => [item.contractId, item]));
      const billVersionsByContract = new Map(
        facts.map((item) => [
          item.contractId,
          new Map(item.bills.map((bill) => [bill.id, bill.modelVersion])),
        ]),
      );
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
      for (const bill of financialBills) {
        const modelVersion = billVersionsByContract.get(bill.contractId)?.get(bill.id);
        if (modelVersion !== bill.modelVersion) {
          throw new Error("Rental bill finance facts could not be loaded");
        }
      }
      const financialTotals = calculateBillFinancialTotals(
        matchingBills,
        facts,
        auth.organizationId,
        today,
      );
      const source = dto.contractId
        ? await this.sources.read(auth.organizationId, dto.contractId, tx)
        : null;
      const coverage =
        source?.contract.billingMode === "monthly_settlement"
          ? null
          : source
            ? billingCoverage(source)
            : null;
      return {
        ...page,
        totals: financialTotals ? { ...page.totals, financial: financialTotals } : page.totals,
        coverage,
        items: page.items.map((bill) => {
          const contractFacts = factsByContract.get(bill.contractId);
          if (bill.modelVersion === 2 && !contractFacts)
            throw new Error("Rental bill finance facts could not be loaded");
          const withFinancial = contractFacts
            ? withBillFinancial(bill, contractFacts, today, auth.organizationId)
            : bill;
          return dueState(withFinancial, today);
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
      const needsFinancial =
        bill.modelVersion === 2 || bill.history.some((item) => item.modelVersion === 2);
      const facts = needsFinancial
        ? (await this.projectionSources.readMany(auth.organizationId, [bill.contractId], tx))[0]
        : undefined;
      if (needsFinancial && !facts)
        throw new Error("Rental bill finance facts could not be loaded");
      const mappedBill = facts ? withBillFinancial(bill, facts, today, auth.organizationId) : bill;
      return {
        ...dueState(mappedBill, today),
        history: bill.history.map((item) =>
          dueState(
            facts ? withBillFinancial(item, facts, today, auth.organizationId) : item,
            today,
          ),
        ),
      };
    });
  }
}
