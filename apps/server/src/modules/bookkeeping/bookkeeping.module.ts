import { Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { IamModule } from "../iam/iam.module.js";
import { AccountsController } from "./accounts.controller.js";
import { AccountsRepository } from "./accounts.repository.js";
import { AccountsService } from "./accounts.service.js";
import { CategoriesController } from "./categories.controller.js";
import { CategoriesRepository } from "./categories.repository.js";
import { CategoriesService } from "./categories.service.js";
import { CategoriesPolicyService } from "./categories-policy.service.js";
import { LedgersController } from "./ledgers.controller.js";
import { LedgersRepository } from "./ledgers.repository.js";
import { LedgersService } from "./ledgers.service.js";
import { OpeningBalanceService } from "./opening-balance.service.js";

/** 组合记账域的账本、账户与分类接口及其依赖。 */
@Module({
  imports: [AuditModule, AuthModule, DbModule, IamModule],
  controllers: [LedgersController, AccountsController, CategoriesController],
  providers: [
    LedgersRepository,
    LedgersService,
    AccountsRepository,
    AccountsService,
    OpeningBalanceService,
    CategoriesRepository,
    CategoriesPolicyService,
    CategoriesService,
  ],
  exports: [AccountsRepository, CategoriesRepository],
})
export class BookkeepingModule {}
