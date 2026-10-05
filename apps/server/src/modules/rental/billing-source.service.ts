import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { organizations } from "../../db/schema.js";
import { BillAdjustmentsRepository } from "./bill-adjustments.repository.js";
import type { BillingSource } from "./billing.types.js";
import { toBillingContractDates } from "./billing-contract-dates.rules.js";
import { toBillAdjustment } from "./bills.queries.js";
import { BillsRepository } from "./bills.repository.js";
import { organizationDate } from "./contract-date.rules.js";
import { toContractDetail } from "./contract-read-model.js";
import { organizationDateTime } from "./contract-time.rules.js";
import { ContractsRepository } from "./contracts.repository.js";

/** 在现有事务和组织锁内组装来源，不独立开启或提交事务。 */
@Injectable()
export class BillingSourceService {
  constructor(
    private readonly contracts: ContractsRepository,
    private readonly bills: BillsRepository,
    private readonly adjustments: BillAdjustmentsRepository,
  ) {}

  async read(
    organizationId: string,
    contractId: string,
    executor: AppDbExecutor,
  ): Promise<BillingSource> {
    const [organization] = await executor
      .select({ baseCurrency: organizations.baseCurrency, timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!organization) throw this.notFound();
    const now = new Date();
    const today = organizationDate(now, organization.timezone);
    const localNow = organizationDateTime(now, organization.timezone);
    const contract = await this.contracts.detail(organizationId, contractId, localNow, executor);
    if (!contract) throw this.notFound();
    const head = await this.contracts.find(organizationId, contractId, executor);
    if (!head) throw this.notFound();
    const activeBills = await this.bills.activeForContract(organizationId, contractId, executor);
    const adjustment = await this.adjustments.findCurrent(organizationId, contractId, executor);
    return {
      organizationId,
      currencyCode: organization.baseCurrency,
      timezone: organization.timezone,
      today,
      contract: toBillingContractDates(toContractDetail(contract)),
      terminationRecordedAt: head.terminationRecordedAt?.toISOString() ?? null,
      activeBills,
      adjustment: adjustment ? toBillAdjustment(adjustment) : null,
    };
  }

  private notFound() {
    return new NotFoundException({ code: apiErrorCodes.notFound, message: "租赁合同不存在" });
  }
}
