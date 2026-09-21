import fastifyCookie from "@fastify/cookie";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createRequestLogger } from "./common/logging/request-logger.js";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware.js";
import { ServerConfigService } from "./config/config.service.js";

export async function configureHttpApplication(app: NestFastifyApplication): Promise<void> {
  const config = app.get(ServerConfigService);

  const fastify = app.getHttpAdapter().getInstance();
  const logger = createRequestLogger("HttpRequest");
  fastify.addHook("onRequest", (request, reply, done) => {
    requestIdMiddleware(request.raw, reply.raw, done);
  });
  fastify.addHook("onResponse", (request, reply, done) => {
    logger.log({
      event: "request.completed",
      requestId: reply.getHeader("x-request-id"),
      method: request.method,
      route: request.routeOptions.url ?? "[unmatched]",
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 100) / 100,
    });
    done();
  });
  await app.register(fastifyCookie);
  app.enableCors({
    credentials: true,
    exposedHeaders: ["X-Request-Id"],
    origin: config.env.WEB_ORIGIN,
  });
}
