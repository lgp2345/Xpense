import { Module } from "@nestjs/common";
import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { BookkeepingModule } from "../bookkeeping/bookkeeping.module.js";
import { BookkeepingWriteLockRepository } from "../bookkeeping/bookkeeping-write-lock.repository.js";
import { IamModule } from "../iam/iam.module.js";
import { BillAdjustmentsRepository } from "./bill-adjustments.repository.js";
import { BillRevisionsRepository } from "./bill-revisions.repository.js";
import { BillRevisionsService } from "./bill-revisions.service.js";
import { BillingLifecycleService } from "./billing-lifecycle.service.js";
import { BillingSourceService } from "./billing-source.service.js";
import { BillingTerminationService } from "./billing-termination.service.js";
import { BillsController } from "./bills.controller.js";
import { BillsRepository } from "./bills.repository.js";
import { BillsService } from "./bills.service.js";
import { BillsReadService } from "./bills-read.service.js";
import { ChargeTermsController } from "./charge-terms.controller.js";
import { ChargeTermsRepository } from "./charge-terms.repository.js";
import { ChargeTermsService } from "./charge-terms.service.js";
import { ContractLifecycleService } from "./contract-lifecycle.service.js";
import { ContractPartiesService } from "./contract-parties.service.js";
import { ContractReferenceService } from "./contract-reference.service.js";
import { ContractRelationsRepository } from "./contract-relations.repository.js";
import { ContractsController } from "./contracts.controller.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsService } from "./contracts.service.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { FinanceRequestsRepository } from "./finance-requests.repository.js";
import { MeterReadingsController } from "./meter-readings.controller.js";
import { MeterReadingsRepository } from "./meter-readings.repository.js";
import { MeterReadingsService } from "./meter-readings.service.js";
import { MonthlyBillingLifecycleService } from "./monthly-billing-lifecycle.service.js";
import { MonthlyBillsController } from "./monthly-bills.controller.js";
import { MonthlyBillsService } from "./monthly-bills.service.js";
import { PropertiesController } from "./properties.controller.js";
import { PropertiesRepository } from "./properties.repository.js";
import { PropertiesService } from "./properties.service.js";
import { PropertiesPolicyService } from "./properties-policy.service.js";
import { RentalCashController } from "./rental-cash.controller.js";
import { RentalCashRepository } from "./rental-cash.repository.js";
import { RentalCashService } from "./rental-cash.service.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";
import { RentalReceiptsController } from "./rental-receipts.controller.js";
import { RentalRefundsController } from "./rental-refunds.controller.js";
import { RentalSettlementsController } from "./rental-settlements.controller.js";
import { RentalSettlementsRepository } from "./rental-settlements.repository.js";
import { RentalSettlementsService } from "./rental-settlements.service.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";
import { SpacesController } from "./spaces.controller.js";
import { SpacesRepository } from "./spaces.repository.js";
import { SpacesService } from "./spaces.service.js";
import { SpacesPolicyService } from "./spaces-policy.service.js";
import { TenantIdentityCryptoService } from "./tenant-identity-crypto.service.js";
import { TenantsController } from "./tenants.controller.js";
import { TenantsRepository } from "./tenants.repository.js";
import { TenantsService } from "./tenants.service.js";
import { TenantsPolicyService } from "./tenants-policy.service.js";

/** 组合租赁房产、空间、租户与合同接口，同时保持仓储为模块私有实现。 */
@Module({
  imports: [AuditModule, AuthModule, BookkeepingModule, DbModule, IamModule],
  controllers: [
    BillsController,
    PropertiesController,
    SpacesController,
    TenantsController,
    ContractsController,
    ChargeTermsController,
    MeterReadingsController,
    MonthlyBillsController,
    RentalReceiptsController,
    RentalRefundsController,
    RentalCashController,
    RentalSettlementsController,
  ],
  providers: [
    BillAdjustmentsRepository,
    BillRevisionsRepository,
    BillRevisionsService,
    ChargeTermsRepository,
    ChargeTermsService,
    FinanceRequestsRepository,
    MeterReadingsRepository,
    MeterReadingsService,
    MonthlyBillsService,
    RentalFinanceSourceService,
    RentalCashRepository,
    RentalCashProjectionRepository,
    RentalCashService,
    RentalSettlementsRepository,
    RentalSettlementsService,
    SettlementProjectionService,
    MonthlyBillingLifecycleService,
    BillingSourceService,
    BillingLifecycleService,
    BillingTerminationService,
    BillsService,
    BillsReadService,
    BillsRepository,

    BookkeepingWriteLockRepository,
    ContractsRepository,
    ContractRelationsRepository,
    ContractsPolicyService,
    ContractReferenceService,
    ContractsService,
    ContractLifecycleService,
    ContractPartiesService,
    PropertiesRepository,
    PropertiesPolicyService,
    PropertiesService,
    SpacesRepository,
    SpacesPolicyService,
    SpacesService,
    TenantIdentityCryptoService,
    TenantsRepository,
    TenantsPolicyService,
    TenantsService,
  ],
})
export class RentalModule {}
