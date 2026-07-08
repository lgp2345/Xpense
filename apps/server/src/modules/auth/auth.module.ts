import { forwardRef, Module } from "@nestjs/common";

import { DbModule } from "../../db/db.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

@Module({
  imports: [DbModule, forwardRef(() => AuditModule)],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, PasswordService, TokenService],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
