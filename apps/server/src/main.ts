import "reflect-metadata";

import { ConsoleLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { ServerConfigService } from "./config/config.service.js";
import { configureHttpApplication } from "./configure-http-application.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === "production" }),
  });
  const config = app.get(ServerConfigService);
  app.setGlobalPrefix(config.apiPrefix);
  await configureHttpApplication(app);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
