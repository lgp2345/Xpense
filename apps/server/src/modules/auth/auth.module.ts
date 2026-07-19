import { forwardRef, Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AccessRepository } from "../iam/access.repository.js";
import { AccessService } from "../iam/access.service.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { OptionalAuthGuard } from "./optional-auth.guard.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

@Module({
  imports: [DbModule, forwardRef(() => AuditModule)],
  controllers: [AuthController],
  providers: [
    AccessRepository,
    AccessService,
    AuthGuard,
    OptionalAuthGuard,
    AuthRepository,
    AuthService,
    PasswordService,
    TokenService,
  ],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
