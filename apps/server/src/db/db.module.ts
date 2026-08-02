import { Global, Module } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ServerConfigService } from "../config/config.service.js";
import { DatabaseReadinessService } from "./database-readiness.service.js";
import { DatabaseTransactionService } from "./database-transaction.service.js";
import { DB } from "./db.tokens.js";

export type AppDb = ReturnType<typeof drizzle>;
export type AppDbTransaction = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
export type AppDbExecutor = AppDb | AppDbTransaction;

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
    DatabaseTransactionService,
  ],
  exports: [DB, DatabaseReadinessService, DatabaseTransactionService],
})
export class DbModule {}
