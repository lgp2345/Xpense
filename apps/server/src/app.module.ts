import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { ServerConfigModule } from "./config/config.module.js";
import { FoundationModule } from "./foundation/foundation.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { IamModule } from "./modules/iam/iam.module.js";
import { OrganizationsModule } from "./modules/organizations/organizations.module.js";

@Module({
  imports: [ServerConfigModule, FoundationModule, AuthModule, OrganizationsModule, IamModule],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
