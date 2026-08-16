import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { nanoid } from "nanoid";
import { create } from "svg-captcha";

import { ServerConfigService } from "../../config/config.service.js";

export type CaptchaChallenge = {
  captchaId: string;
  svg: string;
};

type CaptchaPayload = {
  nonce: string;
  exp: number;
  digest: string;
};

@Injectable()
export class CaptchaService {
  constructor(private readonly config: ServerConfigService) {}

  issue(): CaptchaChallenge {
    const captcha = create({
      size: 4,
      noise: 2,
      color: false,
      ignoreChars: "0oO1ilI",
    });
    const nonce = nanoid(16);
    const exp = this.nowSeconds() + this.config.env.CAPTCHA_TTL_SECONDS;
    const digest = this.sign(`${nonce}:${captcha.text.toLowerCase()}`);
    const payload = this.encodePayload({ nonce, exp, digest });

    return {
      captchaId: `${payload}.${this.sign(payload)}`,
      svg: captcha.data,
    };
  }

  verify(captchaId: string, captchaText: string): boolean {
    const separatorIndex = captchaId.indexOf(".");

    if (separatorIndex <= 0) {
      return false;
    }

    const payload = captchaId.slice(0, separatorIndex);
    const signature = captchaId.slice(separatorIndex + 1);

    if (!this.safeEqual(this.sign(payload), signature)) {
      return false;
    }

    const parsed = this.decodePayload(payload);

    if (!parsed || parsed.exp <= this.nowSeconds()) {
      return false;
    }

    const candidate = this.sign(`${parsed.nonce}:${captchaText.trim().toLowerCase()}`);

    return this.safeEqual(candidate, parsed.digest);
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  private sign(value: string): string {
    return createHmac("sha256", this.config.env.JWT_ACCESS_SECRET)
      .update(value)
      .digest("base64url");
  }

  private safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private encodePayload(payload: CaptchaPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
  }

  private decodePayload(payload: string): CaptchaPayload | null {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }

      const record = parsed as Record<string, unknown>;

      if (
        typeof record.nonce !== "string" ||
        typeof record.exp !== "number" ||
        typeof record.digest !== "string"
      ) {
        return null;
      }

      return { nonce: record.nonce, exp: record.exp, digest: record.digest };
    } catch {
      return null;
    }
  }
}
