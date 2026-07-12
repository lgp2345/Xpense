import { Global, Module } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ServerConfigService } from "../config/config.service.js";
import { DatabaseReadinessService } from "./database-readiness.service.js";
import { DB } from "./db.tokens.js";

export type AppDb = ReturnType<typeof drizzle>;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ServerConfigService],
      useFactory: (config: ServerConfigService) => {
        const client = postgres(config.env.DATABASE_URL);

        return drizzle({ client });
      },
    },
    DatabaseReadinessService,
  ],
  exports: [DB, DatabaseReadinessService],
})
export class DbModule {}
