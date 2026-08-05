import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  APP_NAME,
  type HealthResponse,
  type HelloResponse,
  makeHelloMessage,
  type ReadinessResponse,
} from "@xpense/shared";

import { DatabaseReadinessService } from "../db/database-readiness.service.js";

@Injectable()
export class FoundationService {
  constructor(private readonly databaseReadinessService: DatabaseReadinessService) {}

  getHealth(): HealthResponse {
    return {
      ok: true,
      service: "server",
    };
  }

  getHello(): HelloResponse {
    return {
      appName: APP_NAME,
      message: makeHelloMessage(),
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.databaseReadinessService.check();
    } catch {
      throw new ServiceUnavailableException("服务未就绪");
    }

    return {
      ok: true,
      service: "server",
      database: "ready",
    };
  }
}
