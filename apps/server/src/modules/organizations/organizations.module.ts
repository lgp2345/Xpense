import { Module } from "@nestjs/common";
import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { IamModule } from "../iam/iam.module.js";
import { OrganizationInitializer } from "./organization-initializer.js";
import { OrganizationManagementController } from "./organization-management.controller.js";
import { OrganizationManagementRepository } from "./organization-management.repository.js";
import { OrganizationManagementService } from "./organization-management.service.js";
import { OrganizationSettingsController } from "./organization-settings.controller.js";
import { OrganizationSettingsService } from "./organization-settings.service.js";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsRepository } from "./organizations.repository.js";
import { OrganizationsService } from "./organizations.service.js";

@Module({
  imports: [AuditModule, AuthModule, DbModule, IamModule],
  controllers: [
    OrganizationsController,
    OrganizationManagementController,
    OrganizationSettingsController,
  ],
  providers: [
    OrganizationsRepository,
    OrganizationsService,
    OrganizationManagementRepository,
    OrganizationManagementService,
    OrganizationSettingsService,
    OrganizationInitializer,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
