import { Injectable } from "@nestjs/common";

import { parseServerEnv, type ServerEnv } from "./env.schema.js";

@Injectable()
export class ServerConfigService {
  readonly env: ServerEnv;

  constructor() {
    this.env = parseServerEnv(process.env);
  }

  get apiPrefix(): string {
    return this.env.VITE_API_PREFIX;
  }

  get apiBasePath(): string {
    return `/${this.apiPrefix}`;
  }

  get webRefreshCookiePath(): string {
    return `${this.apiBasePath}/auth`;
  }
}
