import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PermissionKey } from "@xpense/shared";
import type { AuthContext } from "../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../db/database-transaction.service.js";
import type { AppDb } from "../db/db.module.js";
import { DB } from "../db/db.tokens.js";
import { AuditRepository } from "../modules/audit/audit.repository.js";
import { AuditService } from "../modules/audit/audit.service.js";
import { BookkeepingWriteLockRepository } from "../modules/bookkeeping/bookkeeping-write-lock.repository.js";
import { AccessService } from "../modules/iam/access.service.js";
import { BillRevisionsRepository } from "../modules/rental/bill-revisions.repository.js";
import { BillRevisionsService } from "../modules/rental/bill-revisions.service.js";
import { BillsRepository } from "../modules/rental/bills.repository.js";
import { ChargeTermsRepository } from "../modules/rental/charge-terms.repository.js";
import { ContractRelationsRepository } from "../modules/rental/contract-relations.repository.js";
import { ContractsRepository } from "../modules/rental/contracts.repository.js";
import { ContractsPolicyService } from "../modules/rental/contracts-policy.service.js";
import { FinanceRequestsRepository } from "../modules/rental/finance-requests.repository.js";
import { MeterReadingsRepository } from "../modules/rental/meter-readings.repository.js";
import { PropertiesRepository } from "../modules/rental/properties.repository.js";
import { RentalCashRepository } from "../modules/rental/rental-cash.repository.js";
import { RentalCashService } from "../modules/rental/rental-cash.service.js";
import { RentalCashProjectionRepository } from "../modules/rental/rental-cash-projection.repository.js";
import { RentalFinanceSourceService } from "../modules/rental/rental-finance-source.service.js";
import { RentalSettlementsRepository } from "../modules/rental/rental-settlements.repository.js";
import { RentalSettlementsService } from "../modules/rental/rental-settlements.service.js";
import { SettlementProjectionService } from "../modules/rental/settlement-projection.service.js";
import { SpacesRepository } from "../modules/rental/spaces.repository.js";
import { TenantsRepository } from "../modules/rental/tenants.repository.js";

/** 独立真实服务图：仅鉴权上下文为夹具，来源、事务、锁、幂等和审计均为实际 provider。 */
export function createRentalPostgresServices(db: AppDb) {
  return Test.createTestingModule({
    providers: [
      { provide: DB, useValue: db },
      {
        provide: AccessService,
        useValue: {
          assertPermission(auth: AuthContext, permission: PermissionKey) {
            if (!auth.permissions.includes(permission))
              throw new ForbiddenException("缺少所需权限");
          },
        },
      },
      DatabaseTransactionService,
      RentalCashService,
      BillRevisionsService,
      RentalSettlementsService,
      RentalFinanceSourceService,
      SettlementProjectionService,
      ContractsPolicyService,
      BookkeepingWriteLockRepository,
      PropertiesRepository,
      SpacesRepository,
      TenantsRepository,
      ContractsRepository,
      ContractRelationsRepository,
      BillsRepository,
      ChargeTermsRepository,
      MeterReadingsRepository,
      BillRevisionsRepository,
      FinanceRequestsRepository,
      RentalCashRepository,
      RentalCashProjectionRepository,
      RentalSettlementsRepository,
      AuditService,
      AuditRepository,
    ],
  }).compile();
}
