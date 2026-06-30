import { Injectable } from "@nestjs/common";
import {
  APP_NAME,
  type HealthResponse,
  type HelloResponse,
  makeHelloMessage,
} from "@xpense/shared";

@Injectable()
export class FoundationService {
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
}
