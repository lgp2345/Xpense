import { Global, Module } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ServerConfigService } from "../config/config.service.js";
import { DB } from "./db.tokens.js";
import * as schema from "./schema.js";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ServerConfigService],
      useFactory: (config: ServerConfigService) => {
        const client = postgres(config.env.DATABASE_URL);

        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
