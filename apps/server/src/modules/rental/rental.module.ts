import { Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { BookkeepingModule } from "../bookkeeping/bookkeeping.module.js";
import { BookkeepingWriteLockRepository } from "../bookkeeping/bookkeeping-write-lock.repository.js";
import { IamModule } from "../iam/iam.module.js";
import { PropertiesController } from "./properties.controller.js";
import { PropertiesRepository } from "./properties.repository.js";
import { PropertiesService } from "./properties.service.js";
import { PropertiesPolicyService } from "./properties-policy.service.js";

/** 组合租赁房产及后续空间树接口，同时保持仓储为模块私有实现。 */
@Module({
  imports: [AuditModule, AuthModule, BookkeepingModule, DbModule, IamModule],
  controllers: [PropertiesController],
  providers: [
    BookkeepingWriteLockRepository,
    PropertiesRepository,
    PropertiesPolicyService,
    PropertiesService,
  ],
})
export class RentalModule {}
