import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor.js";
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
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
