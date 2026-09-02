import { Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { BookkeepingModule } from "../bookkeeping/bookkeeping.module.js";
import { BookkeepingWriteLockRepository } from "../bookkeeping/bookkeeping-write-lock.repository.js";
import { IamModule } from "../iam/iam.module.js";
import { ContractLifecycleService } from "./contract-lifecycle.service.js";
import { ContractPartiesService } from "./contract-parties.service.js";
import { ContractReferenceService } from "./contract-reference.service.js";
import { ContractRelationsRepository } from "./contract-relations.repository.js";
import { ContractsController } from "./contracts.controller.js";
import { ContractsRepository } from "./contracts.repository.js";
import { ContractsService } from "./contracts.service.js";
import { ContractsPolicyService } from "./contracts-policy.service.js";
import { PropertiesController } from "./properties.controller.js";
import { PropertiesRepository } from "./properties.repository.js";
import { PropertiesService } from "./properties.service.js";
import { PropertiesPolicyService } from "./properties-policy.service.js";
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
  controllers: [PropertiesController, SpacesController, TenantsController, ContractsController],
  providers: [
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
