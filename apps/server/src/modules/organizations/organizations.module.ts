import { Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsRepository } from "./organizations.repository.js";
import { OrganizationsService } from "./organizations.service.js";

@Module({
  imports: [AuditModule, AuthModule, DbModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsRepository, OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
