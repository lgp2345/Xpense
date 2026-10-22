import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module.js";
import { ServerConfigService } from "../config/config.service.js";
import { parseServerEnv, type ServerEnv } from "../config/env.schema.js";
import { configureHttpApplication } from "../configure-http-application.js";
import type { AppDb } from "../db/db.module.js";
import { DB } from "../db/db.tokens.js";

/** 组织 API 的真实仓储演练入口；唯一数据库由隔离 harness 提供。 */
export async function createOrganizationPostgresApp(
  db: AppDb,
): Promise<{ app: NestFastifyApplication; env: ServerEnv }> {
  const env = parseServerEnv({
    DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
    JWT_ACCESS_SECRET: "isolated-http-secret-with-32-characters",
    WEB_ORIGIN: "http://localhost:5173",
    RENTAL_PII_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    RENTAL_PII_LOOKUP_KEY: Buffer.alloc(32, 2).toString("base64"),
  });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(db)
    .overrideProvider(ServerConfigService)
    .useValue({ env, apiPrefix: "api", apiBasePath: "/api", webRefreshCookiePath: "/api/auth" })
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix("api");
  await configureHttpApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, env };
}
