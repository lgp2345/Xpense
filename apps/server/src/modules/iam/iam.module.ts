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
import { MemberAccountsRepository } from "./member-accounts.repository.js";
import { MemberAccountsService } from "./member-accounts.service.js";
import { MenuController } from "./menu.controller.js";
import { MenuRepository } from "./menu.repository.js";
import { MenuService } from "./menu.service.js";
import { MenuPlatformController } from "./menu-platform.controller.js";
import { OrganizationOwnerRepository } from "./organization-owner.repository.js";
import { OrganizationOwnerPolicyService } from "./organization-owner-policy.service.js";
import { PermissionSyncService } from "./permission-sync.service.js";
import { PermissionTreeService } from "./permission-tree.service.js";

@Module({
  imports: [AuditModule, AuthModule, DbModule],
  controllers: [IamController, MenuController, MenuPlatformController],
  providers: [
    AccessRepository,
    AccessService,
    AuthGuard,
    IamRepository,
    IamService,
    MemberAccountsRepository,
    MemberAccountsService,
    OrganizationOwnerRepository,
    OrganizationOwnerPolicyService,
    MenuRepository,
    MenuService,
    PermissionSyncService,
    PermissionTreeService,
    RbacGuard,
  ],
  exports: [OrganizationOwnerRepository, AccessService, AuthGuard, RbacGuard],
})
export class IamModule {}
