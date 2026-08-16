import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";

import { apiErrorCodes } from "../../common/errors/api-error.js";
import { ServerConfigService } from "../../config/config.service.js";
import { LOGIN_RATE_LIMIT_STORE, type RateLimitStore } from "./rate-limit-store.js";

@Injectable()
export class LoginRateLimiterService {
  constructor(
    @Inject(LOGIN_RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    private readonly config: ServerConfigService,
  ) {}

  assertAllowed(ip: string | undefined, phone: string): void {
    const now = Date.now();

    if (this.store.count(this.ipKey(ip), now) >= this.config.env.LOGIN_RATE_LIMIT_IP_MAX) {
      throw this.tooManyRequests();
    }

    if (this.store.count(this.phoneKey(phone), now) >= this.config.env.LOGIN_RATE_LIMIT_PHONE_MAX) {
      throw this.tooManyRequests();
    }
  }

  recordFailure(ip: string | undefined, phone: string): void {
    const now = Date.now();
    this.store.record(this.ipKey(ip), now);
    this.store.record(this.phoneKey(phone), now);
  }

  resetPhone(phone: string): void {
    this.store.reset(this.phoneKey(phone));
  }

  private ipKey(ip: string | undefined): string {
    return `ip:${ip ?? "unknown"}`;
  }

  private phoneKey(phone: string): string {
    return `phone:${phone}`;
  }

  private tooManyRequests(): HttpException {
    return new HttpException(
      {
        code: apiErrorCodes.tooManyRequests,
        message: "尝试过于频繁，请稍后重试",
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
