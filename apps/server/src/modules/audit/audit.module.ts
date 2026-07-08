import { forwardRef, Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AccessRepository } from "../iam/access.repository.js";
import { AccessService } from "../iam/access.service.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { AuditController } from "./audit.controller.js";
import { AuditRepository } from "./audit.repository.js";
import { AuditService } from "./audit.service.js";

@Module({
  imports: [DbModule, forwardRef(() => AuthModule)],
  controllers: [AuditController],
  providers: [AccessRepository, AccessService, AuthGuard, RbacGuard, AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
