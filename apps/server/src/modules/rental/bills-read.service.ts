import { Injectable, NotFoundException } from "@nestjs/common";
import type { RentalBillDetail, RentalBillPage, RentalBillSummary } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AccessService } from "../iam/access.service.js";
import { billingCoverage } from "./billing-plan.rules.js";
import { BillingSourceService } from "./billing-source.service.js";
import { BillsRepository } from "./bills.repository.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import type { BillDetailDto } from "./dto/bill-detail.dto.js";
import type { ListBillsDto } from "./dto/list-bills.dto.js";

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
      const source = dto.contractId
        ? await this.sources.read(auth.organizationId, dto.contractId, tx)
        : null;
      const coverage =
        source?.contract.billingMode === "monthly_settlement"
          ? null
          : source
            ? billingCoverage(source)
            : null;
      return { ...page, coverage, items: page.items.map((bill) => dueState(bill, today)) };
    });
  }

  detail(auth: AuthContext, dto: BillDetailDto): Promise<RentalBillDetail> {
    this.access.assertPermission(auth, "rental_bills:read");
    return this.transactions.run(async (tx) => {
      const { today } = await this.policy.lockOrganizationContext(auth.organizationId, tx);
      const bill = await this.bills.detail(auth.organizationId, dto.id, tx);
      if (!bill)
        throw new NotFoundException({ code: apiErrorCodes.notFound, message: "租赁账单不存在" });
      return {
        ...dueState(bill, today),
        history: bill.history.map((item) => dueState(item, today)),
      };
    });
  }
}
