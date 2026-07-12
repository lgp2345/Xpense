import { Controller, Get } from "@nestjs/common";
import { API_ROUTES, type HealthResponse, type HelloResponse } from "@xpense/shared";

import { FoundationService } from "./foundation.service.js";

@Controller()
export class FoundationController {
  constructor(private readonly foundationService: FoundationService) {}

  @Get(API_ROUTES.health)
  getHealth(): HealthResponse {
    return this.foundationService.getHealth();
  }

  @Get(API_ROUTES.hello)
  getHello(): HelloResponse {
    return this.foundationService.getHello();
  }
}
