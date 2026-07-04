import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { ServerConfigModule } from "./config/config.module.js";
import { FoundationModule } from "./foundation/foundation.module.js";

@Module({
  imports: [ServerConfigModule, FoundationModule],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
