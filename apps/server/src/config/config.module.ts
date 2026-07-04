import { Global, Module } from "@nestjs/common";

import { ServerConfigService } from "./config.service.js";

@Global()
@Module({
  providers: [ServerConfigService],
  exports: [ServerConfigService],
})
export class ServerConfigModule {}
