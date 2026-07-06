import { Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AccessRepository } from "./access.repository.js";
import { AccessService } from "./access.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { RbacGuard } from "./guards/rbac.guard.js";

@Module({
  imports: [AuthModule, DbModule],
  providers: [AccessRepository, AccessService, AuthGuard, RbacGuard],
  exports: [AccessService, AuthGuard, RbacGuard],
})
export class IamModule {}
