import { Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AccessRepository } from "./access.repository.js";
import { AccessService } from "./access.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { RbacGuard } from "./guards/rbac.guard.js";
import { IamController } from "./iam.controller.js";
import { IamRepository } from "./iam.repository.js";
import { IamService } from "./iam.service.js";

@Module({
  imports: [AuditModule, AuthModule, DbModule],
  controllers: [IamController],
  providers: [AccessRepository, AccessService, AuthGuard, RbacGuard, IamRepository, IamService],
  exports: [AccessService, AuthGuard, RbacGuard],
})
export class IamModule {}
