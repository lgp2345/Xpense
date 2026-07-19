import fastifyCookie from "@fastify/cookie";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { ServerConfigService } from "./config/config.service.js";

export async function configureHttpApplication(app: NestFastifyApplication): Promise<void> {
  const config = app.get(ServerConfigService);

  await app.register(fastifyCookie);
  app.enableCors({
    credentials: true,
    origin: config.env.WEB_ORIGIN,
  });
}
