import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { ServerConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { FoundationModule } from "./foundation/foundation.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { IamModule } from "./modules/iam/iam.module.js";
import { OrganizationsModule } from "./modules/organizations/organizations.module.js";
import { UserModule } from "./modules/user/user.module.js";

@Module({
  imports: [
    ServerConfigModule,
    DbModule,
    FoundationModule,
    AuthModule,
    OrganizationsModule,
    IamModule,
    UserModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
