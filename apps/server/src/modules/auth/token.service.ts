import { createHash, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { jwtVerify, SignJWT } from "jose";
import { nanoid } from "nanoid";

import { ServerConfigService } from "../../config/config.service.js";

export type AccessTokenPayload = {
  userId: string;
  sessionId: string;
  organizationId: string;
};

@Injectable()
export class TokenService {
  constructor(private readonly config: ServerConfigService) {}

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    const secret = this.getAccessTokenSecret();

    return new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${this.config.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const secret = this.getAccessTokenSecret();
    const { payload } = await jwtVerify(token, secret);

    if (
      typeof payload.userId !== "string" ||
      typeof payload.sessionId !== "string" ||
      typeof payload.organizationId !== "string"
    ) {
      throw new UnauthorizedException("Invalid access token payload");
    }

    return {
      userId: payload.userId,
      sessionId: payload.sessionId,
      organizationId: payload.organizationId,
    };
  }

  createRefreshToken(): string {
    return nanoid(64);
  }

  async hashRefreshToken(token: string): Promise<string> {
    return createHash("sha256").update(token).digest("hex");
  }

  async verifyRefreshTokenHash(token: string, hash: string): Promise<boolean> {
    const incoming = Buffer.from(await this.hashRefreshToken(token), "hex");
    const existing = Buffer.from(hash, "hex");

    return incoming.length === existing.length && timingSafeEqual(incoming, existing);
  }

  private getAccessTokenSecret(): Uint8Array {
    return new TextEncoder().encode(this.config.env.JWT_ACCESS_SECRET);
  }
}
